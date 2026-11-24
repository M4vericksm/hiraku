"""Adapter da Drope Scan (dropescan.com).

O site le de uma API JSON publica (`api.dropescan.com/v1`), sem login para ler.
As imagens ficam em `bucket-1.dropescan.com` sem cabecalho CORS, entao capas e
paginas passam pelo proxy `/image` (o `CatalogService` reescreve as URLs).

- busca:     GET /obras?query=...&limit=...&offset=0
- obra:      nao ha rota por id (o site tira do HTML do Next.js); o detalhe sai
             da listagem completa (/obras paginado, ~250 obras), em cache.
- capitulos: GET /obras/{id}/chapters
- paginas:   GET /chapter/{id}

Capa e pagina tem varias resolucoes; usamos a alta (`Variants.high` quando
existe, senao `SourceHigh`, senao `Source`).
"""

import asyncio
import time

from app.core.http import get_client
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.sources.genres import normalize_genres
from app.sources.normalization import chapter_sort_key, parse_chapter_number, title_score

API_URL = "https://api.dropescan.com/v1"
CDN_URL = "https://bucket-1.dropescan.com/"
SITE_URL = "https://beta.dropescan.com/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Origin": SITE_URL.rstrip("/"),
    "Referer": SITE_URL,
}


CATALOG_PAGE_SIZE = 100
CATALOG_TTL_SECONDS = 60 * 60


class DropeScanSource:
    def __init__(self) -> None:
        self._catalog: dict[str, dict] = {}
        self._catalog_loaded_at = 0.0
        self._catalog_lock = asyncio.Lock()

    @property
    def info(self) -> SourceInfo:
        return SourceInfo(id="dropescan", name="Drope Scan", risk="medium")

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        data = await self._get("/obras", params={"query": query, "limit": limit, "offset": 0})
        results = []
        for obra in data.get("data") or []:
            result = self._map_obra(obra)
            if result is None:
                continue
            result.score = title_score(query, [result.title, *result.alt_titles])
            results.append(result)
        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        obra = (await self._catalog_by_id()).get(manga_source_id)
        result = self._map_obra(obra) if obra else None
        if result is None:
            raise ValueError(f"Obra nao encontrada na Drope Scan: {manga_source_id}")
        result.score = 1.0
        return result

    async def _catalog_by_id(self) -> dict[str, dict]:
        async with self._catalog_lock:
            fresh = time.monotonic() - self._catalog_loaded_at < CATALOG_TTL_SECONDS
            if self._catalog and fresh:
                return self._catalog
            catalog: dict[str, dict] = {}
            offset = 0
            while True:
                data = await self._get(
                    "/obras", params={"limit": CATALOG_PAGE_SIZE, "offset": offset}
                )
                batch = data.get("data") or []
                for obra in batch:
                    if obra.get("ObraId"):
                        catalog[obra["ObraId"]] = obra
                total = ((data.get("meta") or {}).get("total")) or 0
                offset += len(batch)
                if not batch or offset >= total or offset > 5000:
                    break
            self._catalog = catalog
            self._catalog_loaded_at = time.monotonic()
            return catalog

    async def chapters(self, manga_source_id: str, language: str = "pt-br") -> list[Chapter]:
        # Drope e monolingue (pt-br); `language` e ignorado de proposito.
        data = await self._get(f"/obras/{manga_source_id}/chapters")
        items = (data.get("data") or {}).get("chapters") or []
        chapters: list[Chapter] = []
        seen: set[str] = set()
        for item in items:
            chapter_id = item.get("ChapterId")
            if not chapter_id or chapter_id in seen:
                continue
            seen.add(chapter_id)
            number = str(item.get("ChapterNumber") or "").strip() or None
            title = (item.get("ChapterName") or "").strip() or (
                f"Capítulo {number}" if number else None
            )
            pages = item.get("ChapterPages")
            chapters.append(
                Chapter(
                    source=self.info.id,
                    source_id=chapter_id,
                    manga_source_id=manga_source_id,
                    title=title,
                    chapter=number,
                    language="pt-br",
                    pages=int(pages) if str(pages or "").isdigit() else None,
                    normalized_number=parse_chapter_number(number, title),
                    sort_key=chapter_sort_key(number, title),
                )
            )
        return sorted(chapters, key=lambda item: item.sort_key)

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        data = await self._get(f"/chapter/{chapter_source_id}")
        chapter = (data.get("data") or {}).get("chapter") or {}
        urls = [
            url
            for url in (_image_url(_best_path(page)) for page in chapter.get("ChapterContent") or [])
            if url
        ]
        return ChapterPages(
            source=self.info.id,
            source_chapter_id=chapter_source_id,
            page_urls=urls,
            data_saver=False,
        )

    def _map_obra(self, obra: dict) -> MangaSearchResult | None:
        obra_id = obra.get("ObraId")
        title = (obra.get("Title") or "").strip()
        if not obra_id or not title:
            return None
        banners = obra.get("Banners") or []
        banner = next((b for b in banners if b.get("isPrimary")), banners[0] if banners else None)
        alt_titles = [
            name
            for name in (
                (item.get("title") or item.get("Title") or "").strip()
                for item in obra.get("OtherTitles") or []
                if isinstance(item, dict)
            )
            if name
        ]
        genre_names = [
            tag.get(key)
            for group, key in (("Genres", "GenreName"), ("Themes", "ThemeName"))
            for tag in obra.get(group) or []
            if isinstance(tag, dict) and tag.get(key)
        ]
        return MangaSearchResult(
            source=self.info.id,
            source_id=obra_id,
            title=title,
            alt_titles=alt_titles[:10],
            description=(obra.get("Synopsis") or "").strip() or None,
            cover_url=_image_url(_best_path(banner)) if banner else None,
            language="pt-br",
            genres=normalize_genres(genre_names),
        )

    async def _get(self, path: str, params: dict | None = None) -> dict:
        response = await get_client().get(f"{API_URL}{path}", params=params, headers=HEADERS)
        response.raise_for_status()
        return response.json()


def _best_path(item: dict | None) -> str | None:
    if not isinstance(item, dict):
        return None
    variants = item.get("Variants") or item.get("variants") or {}
    high = variants.get("high") if isinstance(variants, dict) else None
    if isinstance(high, dict) and high.get("source"):
        return high["source"]
    return item.get("SourceHigh") or item.get("sourceHigh") or item.get("Source") or item.get(
        "source"
    )


def _image_url(path: str | None) -> str | None:
    if not path:
        return None
    if path.startswith("http"):
        return path
    return CDN_URL + path.lstrip("/")
