from typing import Protocol

from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo


class SourceAdapter(Protocol):
    @property
    def info(self) -> SourceInfo:
        raise NotImplementedError

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        raise NotImplementedError

    async def popular(self, limit: int = 20) -> list[MangaSearchResult]:
        """Destaques da fonte, para o catalogo ter o que mostrar antes da busca.

        Opcional: nem toda fonte expoe um ranking. Quem nao implementa
        simplesmente nao contribui — o CatalogService ignora a ausencia em vez
        de exigir um metodo vazio em cada adapter.
        """
        raise NotImplementedError

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        raise NotImplementedError

    async def chapters(self, manga_source_id: str, language: str = "pt-br") -> list[Chapter]:
        raise NotImplementedError

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        raise NotImplementedError
