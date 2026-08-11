from typing import Any

from app.core.config import settings
from app.core.http import get_client
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.sources.genres import normalize_genres
from app.sources.normalization import chapter_sort_key, parse_chapter_number, title_score


class MangaDexSource:
    @property
    def info(self) -> SourceInfo:
        return SourceInfo(
            id="mangadex",
            name="MangaDex",
            supports_search=True,
            supports_pages=True,
            risk="medium",
        )

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        params: list[tuple[str, str | int]] = [
            ("title", query),
            ("limit", limit),
            ("includes[]", "cover_art"),
            ("includes[]", "author"),
            ("availableTranslatedLanguage[]", settings.default_language),
            ("availableTranslatedLanguage[]", "en"),
        ]
        data = await self._get("/manga", params=params)
        results = [self._map_manga(item, query) for item in data.get("data", [])]
        return sorted(results, key=lambda item: (item.score, -len(item.title)), reverse=True)

    async def popular(self, limit: int = 20) -> list[MangaSearchResult]:
        # followedCount e o ranking mais estavel da API: reflete quem a base
        # acompanha, e nao um pico de acessos do dia.
        params: list[tuple[str, str | int]] = [
            ("limit", limit),
            ("includes[]", "cover_art"),
            ("order[followedCount]", "desc"),
            ("hasAvailableChapters", "true"),
            ("availableTranslatedLanguage[]", settings.default_language),
        ]
        data = await self._get("/manga", params=params)
        # Sem reordenar: a ordem que a fonte devolveu *e* o ranking.
        return [self._map_manga(item, "") for item in data.get("data", [])]

    async def chapters(self, manga_source_id: str, language: str = "pt-br") -> list[Chapter]:
        params: list[tuple[str, str | int]] = [
            ("limit", 100),
            ("translatedLanguage[]", language),
            ("order[chapter]", "asc"),
            ("includes[]", "scanlation_group"),
        ]
        data = await self._get(f"/manga/{manga_source_id}/feed", params=params)
        chapters = [self._map_chapter(item, manga_source_id) for item in data.get("data", [])]
        return sorted(chapters, key=lambda item: item.sort_key)

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        data = await self._get(f"/at-home/server/{chapter_source_id}")
        chapter = data.get("chapter", {})
        hash_value = chapter.get("hash")
        page_files = chapter.get("dataSaver" if data_saver else "data", [])
        base_url = data.get("baseUrl")
        quality = "data-saver" if data_saver else "data"

        page_urls = [
            f"{base_url}/{quality}/{hash_value}/{page_file}"
            for page_file in page_files
            if base_url and hash_value and page_file
        ]
        return ChapterPages(
            source=self.info.id,
            source_chapter_id=chapter_source_id,
            page_urls=page_urls,
            data_saver=data_saver,
        )

    async def _get(self, path: str, params: list[tuple[str, str | int]] | None = None) -> dict[str, Any]:
        url = f"{settings.mangadex_base_url.rstrip('/')}{path}"
        response = await get_client().get(url, params=params)
        response.raise_for_status()
        return response.json()

    def _map_manga(self, item: dict[str, Any], query: str) -> MangaSearchResult:
        attrs = item.get("attributes", {})
        title_map = attrs.get("title", {})
        title = self._resolve_title(title_map, attrs.get("altTitles", []))
        alt_titles = [
            value
            for alt in attrs.get("altTitles", [])
            for value in alt.values()
            if isinstance(value, str)
        ]
        description_map = attrs.get("description", {})
        description = (
            description_map.get("pt-br") or description_map.get("en") or next(iter(description_map.values()), None)
        )
        cover_file = self._cover_filename(item)
        cover_url = (
            f"https://uploads.mangadex.org/covers/{item.get('id')}/{cover_file}.256.jpg"
            if cover_file
            else None
        )
        primary_score = title_score(query, [title])
        alias_score = title_score(query, [*alt_titles, *title_map.values()]) * 0.93
        tags = [
            tag.get("attributes", {}).get("name", {}).get("en")
            for tag in attrs.get("tags", [])
            if isinstance(tag, dict)
        ]
        genres = normalize_genres([t for t in tags if isinstance(t, str)])
        return MangaSearchResult(
            source=self.info.id,
            source_id=item.get("id", ""),
            title=title,
            alt_titles=alt_titles[:8],
            description=description,
            cover_url=cover_url,
            genres=genres,
            score=max(primary_score, alias_score),
        )

    def _map_chapter(self, item: dict[str, Any], manga_source_id: str) -> Chapter:
        attrs = item.get("attributes", {})
        chapter = attrs.get("chapter")
        title = attrs.get("title")
        sort_key = chapter_sort_key(chapter, title)
        return Chapter(
            source=self.info.id,
            source_id=item.get("id", ""),
            manga_source_id=manga_source_id,
            title=title,
            chapter=chapter,
            volume=attrs.get("volume"),
            language=attrs.get("translatedLanguage"),
            pages=attrs.get("pages"),
            # MangaDex manda "" quando o capitulo nao tem URL externa; HttpUrl
            # rejeita string vazia e derrubava a lista inteira de capitulos.
            external_url=attrs.get("externalUrl") or None,
            normalized_number=parse_chapter_number(chapter, title),
            sort_key=sort_key,
        )

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        """Fetch a single manga's metadata by its MangaDex ID."""
        params: list[tuple[str, str]] = [("includes[]", "cover_art")]
        data = await self._get(f"/manga/{manga_source_id}", params=params)
        item = data.get("data", {})
        return self._map_manga(item, "")

    @staticmethod
    def _resolve_title(
        title_map: dict[str, str], alt_title_list: list[dict[str, str]]
    ) -> str:
        """Pick the best human-readable title, preferring English / romanised."""
        # 1. Primary title map: en > ja-ro > first value
        preferred = ("en", "ja-ro", "ja", "zh-ro", "ko-ro")
        for lang in preferred:
            if lang in title_map:
                return title_map[lang]

        # 2. altTitles: flatten into {lang: value} and try same priority
        alt_flat: dict[str, str] = {}
        for entry in alt_title_list:
            for lang, val in entry.items():
                if isinstance(val, str) and lang not in alt_flat:
                    alt_flat[lang] = val
        for lang in preferred:
            if lang in alt_flat:
                return alt_flat[lang]

        # 3. Absolute fallback
        if title_map:
            return next(iter(title_map.values()))
        if alt_flat:
            return next(iter(alt_flat.values()))
        return "Sem título"

    @staticmethod
    def _cover_filename(item: dict[str, Any]) -> str | None:
        for relationship in item.get("relationships", []):
            if relationship.get("type") == "cover_art":
                return relationship.get("attributes", {}).get("fileName")
        return None
