import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.http import IMAGE_TIMEOUT, get_client
from app.domain.schemas import Chapter, ChapterPages, GenreInfo, MangaSearchResult, SourceInfo
from app.services.catalog import CatalogService, get_catalog_service
from app.services.images import ImageProxyError, fetch_image
from app.sources.genres import CANONICAL
from app.sources.registry import UnknownSourceError

router = APIRouter()


def _source_unavailable(exc: Exception) -> HTTPException:
    """Falha da fonte externa nao e culpa do cliente: responde 502."""
    return HTTPException(status_code=502, detail=f"Fonte indisponivel: {exc}")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/sources", response_model=list[SourceInfo])
async def sources(service: CatalogService = Depends(get_catalog_service)) -> list[SourceInfo]:
    return service.sources()


@router.get("/genres", response_model=list[GenreInfo])
async def genres() -> list[GenreInfo]:
    """Catalogo de generos conhecidos, para o frontend montar o filtro.

    E a lista canonica inteira, nao so os generos presentes nos resultados: o
    filtro precisa existir antes da primeira busca.
    """
    return [GenreInfo(slug=slug, label=label) for slug, label in CANONICAL.items()]


@router.get("/manga/search", response_model=list[MangaSearchResult])
async def search_manga(
    q: str = Query(..., min_length=2),
    source: str | None = Query(default=None),
    # Teto alto porque `limit` e o total agregado de todas as fontes, nao por
    # fonte: com cinco fontes vivas, 30 ja da poucas obras de cada uma.
    limit: int = Query(default=10, ge=1, le=60),
    service: CatalogService = Depends(get_catalog_service),
) -> list[MangaSearchResult]:
    try:
        return await service.search(q, source_id=source, limit=limit)
    except UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise _source_unavailable(exc) from exc


@router.get("/manga/{source}/{source_manga_id}", response_model=MangaSearchResult)
async def manga_detail(
    source: str,
    source_manga_id: str,
    service: CatalogService = Depends(get_catalog_service),
) -> MangaSearchResult:
    try:
        return await service.detail(source, source_manga_id)
    except UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Manga nao encontrado") from exc
        raise _source_unavailable(exc) from exc
    except httpx.HTTPError as exc:
        raise _source_unavailable(exc) from exc


@router.get("/manga/{source}/{source_manga_id}/chapters", response_model=list[Chapter])
async def manga_chapters(
    source: str,
    source_manga_id: str,
    language: str = Query(default="pt-br"),
    service: CatalogService = Depends(get_catalog_service),
) -> list[Chapter]:
    try:
        return await service.chapters(source, source_manga_id, language=language)
    except UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise _source_unavailable(exc) from exc


@router.get("/chapters/{source}/{source_chapter_id}/pages", response_model=ChapterPages)
async def chapter_pages(
    source: str,
    source_chapter_id: str,
    data_saver: bool = Query(default=False),
    service: CatalogService = Depends(get_catalog_service),
) -> ChapterPages:
    try:
        return await service.pages(source, source_chapter_id, data_saver=data_saver)
    except UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise _source_unavailable(exc) from exc


@router.get("/image")
async def image(url: str = Query(..., min_length=8)) -> Response:
    """Serve imagens das fontes que nao enviam CORS.

    Necessario para o download offline: o navegador bloqueia `fetch()` em
    imagens sem CORS, mesmo quando elas carregam normalmente numa tag <img>.
    """
    try:
        content, content_type = await fetch_image(url, get_client(), timeout=IMAGE_TIMEOUT)
    except ImageProxyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise _source_unavailable(exc) from exc

    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
