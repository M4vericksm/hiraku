import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

from app.core.config import settings
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.services.images import needs_proxy, proxy_url
from app.sources.registry import SourceRegistry, default_registry

T = TypeVar("T")

logger = logging.getLogger(__name__)


class MemoryTtlCache:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = ttl_seconds
        self._items: dict[str, tuple[float, object]] = {}

    async def get_or_set(self, key: str, factory: Callable[[], Awaitable[T]]) -> T:
        now = time.monotonic()
        item = self._items.get(key)
        if item and item[0] > now:
            return item[1]  # type: ignore[return-value]

        value = await factory()
        self._items[key] = (now + self.ttl_seconds, value)
        return value


def _proxied(url: str | None) -> str | None:
    """Roteia a URL pelo proxy quando a fonte nao envia CORS."""
    if not url:
        return None
    return proxy_url(url) if needs_proxy(url) else url


class CatalogService:
    def __init__(self, registry: SourceRegistry, cache: MemoryTtlCache) -> None:
        self.registry = registry
        self.cache = cache

    def sources(self) -> list[SourceInfo]:
        return [adapter.info for adapter in self.registry.all()]

    async def search(
        self, query: str, source_id: str | None = None, limit: int = 10
    ) -> list[MangaSearchResult]:
        adapters = [self.registry.get(source_id)] if source_id else self.registry.all()

        # Em multi-fonte cada adapter precisa trazer mais que `limit`: o
        # interleave descarta a cauda de cada pool, e pedir exatamente `limit`
        # deixaria uma fonte sem candidato ja na segunda rodada. O teto e alto
        # de proposito — as scans PT-BR tem catalogo pequeno e se esgotam
        # rapido, entao quem ainda tem candidato precisa poder preencher.
        per_source = limit if source_id else min(limit * 2, 60)

        async def _one(adapter) -> list[MangaSearchResult]:
            key = f"search:{adapter.info.id}:{query.strip().lower()}:{per_source}"
            try:
                return await self.cache.get_or_set(
                    key, lambda a=adapter: a.search(query, per_source)
                )
            except Exception:
                # Uma fonte morta nao pode apagar o resultado das outras.
                # Em busca de fonte unica o caller ainda recebe lista vazia e
                # decide o status HTTP; em multi-fonte devolvemos o que sobrou.
                logger.exception("Busca falhou em %s", adapter.info.id)
                return []

        batches = await asyncio.gather(*[_one(adapter) for adapter in adapters])
        ranked = self._interleave(batches, limit)
        return [self._with_proxied_cover(result) for result in ranked]

    @staticmethod
    def _interleave(
        batches: list[list[MangaSearchResult]], limit: int
    ) -> list[MangaSearchResult]:
        """Intercala as fontes em vez de so ordenar por score.

        Ordenar o pool inteiro por score parece certo mas na pratica entrega
        so uma fonte: o MangaDex tem catalogo enorme e devolve `limit` titulos
        parecidos, todos com score alto, empurrando as scans PT-BR para fora
        do corte mesmo quando elas tem a obra. Rodada a rodada cada fonte poe
        seu melhor resultado ainda nao usado, entao o topo do ranking vira uma
        amostra de todas as fontes vivas e o resto preenche por score.
        """
        pools = [
            sorted(batch, key=lambda result: result.score, reverse=True)
            for batch in batches
            if batch
        ]

        picked: list[MangaSearchResult] = []
        seen: set[tuple[str, str]] = set()
        cursor = 0

        while len(picked) < limit and any(cursor < len(pool) for pool in pools):
            round_items = [pool[cursor] for pool in pools if cursor < len(pool)]
            # Dentro da rodada o score ainda manda: a fonte com o melhor
            # casamento aparece primeiro, so nao monopoliza a lista.
            for item in sorted(round_items, key=lambda result: result.score, reverse=True):
                key = (item.source, item.source_id)
                if key in seen:
                    continue
                seen.add(key)
                picked.append(item)
                if len(picked) == limit:
                    break
            cursor += 1

        return picked

    async def detail(self, source_id: str, source_manga_id: str) -> MangaSearchResult:
        adapter = self.registry.get(source_id)
        key = f"detail:{source_id}:{source_manga_id}"
        result = await self.cache.get_or_set(key, lambda: adapter.detail(source_manga_id))
        return self._with_proxied_cover(result)

    @staticmethod
    def _with_proxied_cover(result: MangaSearchResult) -> MangaSearchResult:
        proxied = _proxied(result.cover_url)
        if proxied == result.cover_url:
            return result
        return result.model_copy(update={"cover_url": proxied})

    async def chapters(self, source_id: str, source_manga_id: str, language: str) -> list[Chapter]:
        adapter = self.registry.get(source_id)
        key = f"chapters:{source_id}:{source_manga_id}:{language}"
        return await self.cache.get_or_set(
            key, lambda: adapter.chapters(source_manga_id, language=language)
        )

    async def pages(
        self, source_id: str, source_chapter_id: str, data_saver: bool = False
    ) -> ChapterPages:
        adapter = self.registry.get(source_id)
        key = f"pages:{source_id}:{source_chapter_id}:{data_saver}"
        result = await self.cache.get_or_set(
            key, lambda: adapter.pages(source_chapter_id, data_saver=data_saver)
        )
        proxied = [_proxied(url) or url for url in result.page_urls]
        if proxied == result.page_urls:
            return result
        return result.model_copy(update={"page_urls": proxied})


_service = CatalogService(
    registry=default_registry(),
    cache=MemoryTtlCache(ttl_seconds=settings.cache_ttl_seconds),
)


def get_catalog_service() -> CatalogService:
    return _service
