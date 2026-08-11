"""Populares: ordem, mistura de fontes e tolerancia a falha.

Sem pytest-asyncio no projeto, cada teste roda a corrotina com asyncio.run —
mais simples que trazer um plugin so para isto.
"""

import asyncio

from app.domain.schemas import MangaSearchResult, SourceInfo
from app.services.catalog import CatalogService, MemoryTtlCache
from app.sources.registry import SourceRegistry


def _result(source: str, index: int) -> MangaSearchResult:
    return MangaSearchResult(
        source=source, source_id=f"{source}-{index}", title=f"{source} {index}"
    )


class _Ranked:
    """Fonte com ranking proprio."""

    def __init__(self, source_id: str, count: int) -> None:
        self._id = source_id
        self._count = count

    @property
    def info(self) -> SourceInfo:
        return SourceInfo(id=self._id, name=self._id)

    async def popular(self, limit: int = 20) -> list[MangaSearchResult]:
        return [_result(self._id, i) for i in range(self._count)]


class _Unranked:
    """Fonte sem ranking: nao implementa popular()."""

    @property
    def info(self) -> SourceInfo:
        return SourceInfo(id="sem-ranking", name="Sem ranking")


class _Broken:
    @property
    def info(self) -> SourceInfo:
        return SourceInfo(id="quebrada", name="Quebrada")

    async def popular(self, limit: int = 20) -> list[MangaSearchResult]:
        raise RuntimeError("fonte fora do ar")


def _service(*adapters) -> CatalogService:
    registry = SourceRegistry()
    for adapter in adapters:
        registry.register(adapter)
    return CatalogService(registry=registry, cache=MemoryTtlCache(ttl_seconds=0))


def _ids(*adapters, **kwargs) -> list[str]:
    results = asyncio.run(_service(*adapters).popular(**kwargs))
    return [result.source_id for result in results]


def test_popular_preserva_a_ordem_da_fonte() -> None:
    # A ordem devolvida pela fonte *e* o ranking: reordenar destruiria isso.
    assert _ids(_Ranked("a", 3)) == ["a-0", "a-1", "a-2"]


def test_popular_alterna_entre_as_fontes() -> None:
    # Concatenar deixaria a primeira fonte ocupar a grade inteira.
    assert _ids(_Ranked("a", 2), _Ranked("b", 2)) == ["a-0", "b-0", "a-1", "b-1"]


def test_popular_ignora_fonte_sem_ranking() -> None:
    assert _ids(_Ranked("a", 2), _Unranked()) == ["a-0", "a-1"]


def test_fonte_quebrada_nao_apaga_as_outras() -> None:
    assert _ids(_Ranked("a", 2), _Broken()) == ["a-0", "a-1"]


def test_popular_respeita_o_limite() -> None:
    assert len(_ids(_Ranked("a", 10), limit=3)) == 3


def test_fonte_mais_curta_nao_deixa_buraco_na_mistura() -> None:
    assert _ids(_Ranked("a", 3), _Ranked("b", 1)) == ["a-0", "b-0", "a-1", "a-2"]
