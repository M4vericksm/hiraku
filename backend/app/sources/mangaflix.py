"""Adapter do MangaFlix (mangaflix.net).

O site e uma SPA sobre uma API JSON publica (`api.mangaflix.net/v1`), sem
login para ler. As imagens (capas e paginas) vem de `static.`/`cdn.mangaflix.net`
com `Access-Control-Allow-Origin: *`, entao vao direto para o navegador, sem
passar pelo proxy.

- busca:    GET /search/mangas?query=...&selected_language=pt-br
- obra:     GET /mangas/{id}               (traz a lista de capitulos junto)
- paginas:  GET /chapters/{id}?selected_language=pt-br

A obra traz os generos como ids; os nomes vem de GET /genres, guardados em
memoria porque mudam raramente.
"""

import asyncio
import time

from app.core.http import get_client
from app.sources.base import SourceNotFoundError
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.sources.genres import normalize_genres
from app.sources.normalization import chapter_sort_key, parse_chapter_number, title_score

API_URL = "https://api.mangaflix.net/v1"
LANGUAGE = "pt-br"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Origin": "https://mangaflix.net",
    "Referer": "https://mangaflix.net/",
}
GENRES_TTL_SECONDS = 6 * 60 * 60


class MangaFlixSource:
    def __init__(self) -> None:
        self._genres: dict[str, str] = {}
        self._genres_loaded_at = 0.0
        self._genres_lock = asyncio.Lock()

    @property
    def info(self) -> SourceInfo:
        return SourceInfo(id="mangaflix", name="MangaFlix", risk="medium")

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        data = await self._get(
            "/search/mangas", params={"query": query, "selected_language": LANGUAGE}
        )
        works = (data.get("data") or {}).get("works") or []
        results = []
        for work in works:
            result = self._map_work(work)
            if result is None:
                continue
            result.score = title_score(query, [result.title])
            results.append(result)
        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        work = await self._work(manga_source_id)
        result = self._map_work(work)
        if result is None:
            raise SourceNotFoundError(f"Obra sem dados: {manga_source_id}")
        genre_names = await self._genre_names(work.get("genres") or [])
        result.genres = normalize_genres(genre_names)
        result.score = 1.0
        return result

    async def chapters(self, manga_source_id: str, language: str = LANGUAGE) -> list[Chapter]:
        # O MangaFlix e monolingue (pt-br); `language` e ignorado de proposito.
        work = await self._work(manga_source_id)
        chapters: list[Chapter] = []
        seen: set[str] = set()
        for item in work.get("chapters") or []:
            chapter_id = item.get("_id")
            number = str(item.get("number") or "").strip()
            if not chapter_id or chapter_id in seen:
                continue
            seen.add(chapter_id)
            title = f"Capítulo {number}" if number else None
            chapters.append(
                Chapter(
                    source=self.info.id,
                    source_id=chapter_id,
                    manga_source_id=manga_source_id,
                    title=title,
                    chapter=number or None,
                    language=LANGUAGE,
                    pages=item.get("number_of_pages"),
                    normalized_number=parse_chapter_number(number, title),
                    sort_key=chapter_sort_key(number, title),
                )
            )
        return sorted(chapters, key=lambda item: item.sort_key)

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        data = await self._get(
            f"/chapters/{chapter_source_id}", params={"selected_language": LANGUAGE}
        )
        images = (data.get("data") or {}).get("images") or []
        ordered = sorted(images, key=lambda image: image.get("order") or 0)
        urls = [image["default_url"] for image in ordered if image.get("default_url")]
        return ChapterPages(
            source=self.info.id,
            source_chapter_id=chapter_source_id,
            page_urls=urls,
            data_saver=False,
        )

    async def _work(self, manga_source_id: str) -> dict:
        data = await self._get(f"/mangas/{manga_source_id}")
        return data.get("data") or {}

    def _map_work(self, work: dict) -> MangaSearchResult | None:
        work_id = work.get("_id")
        title = (work.get("name") or "").strip()
        if not work_id or not title:
            return None
        poster = work.get("poster") or {}
        return MangaSearchResult(
            source=self.info.id,
            source_id=work_id,
            title=title,
            description=(work.get("description") or "").strip() or None,
            cover_url=poster.get("default_url"),
            language=LANGUAGE,
        )

    async def _genre_names(self, genres: list) -> list[str]:
        # A busca traz so os ids; o detalhe da obra ja traz {_id, name}.
        names = [g["name"] for g in genres if isinstance(g, dict) and g.get("name")]
        genre_ids = [g for g in genres if isinstance(g, str)]
        if not genre_ids:
            return names
        async with self._genres_lock:
            stale = time.monotonic() - self._genres_loaded_at > GENRES_TTL_SECONDS
            if not self._genres or stale:
                try:
                    data = await self._get(
                        "/genres", params={"include_adult": "true", "selected_language": LANGUAGE}
                    )
                    self._genres = {
                        item["_id"]: item["name"]
                        for item in data.get("data") or []
                        if item.get("_id") and item.get("name")
                    }
                    self._genres_loaded_at = time.monotonic()
                except Exception:
                    # Genero e enfeite: sem a lista, a obra abre sem eles.
                    return []
        return names + [self._genres[i] for i in genre_ids if i in self._genres]

    async def _get(self, path: str, params: dict | None = None) -> dict:
        response = await get_client().get(f"{API_URL}{path}", params=params, headers=HEADERS)
        response.raise_for_status()
        return response.json()
