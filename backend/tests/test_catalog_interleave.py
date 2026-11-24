from app.domain.schemas import MangaSearchResult
from app.services.catalog import CatalogService


def _result(source: str, source_id: str, score: float) -> MangaSearchResult:
    return MangaSearchResult(
        source=source,
        source_id=source_id,
        title=f"{source}-{source_id}",
        score=score,
    )


def test_interleave_da_vez_a_cada_fonte_antes_de_repetir() -> None:
    """O caso que motivou o interleave: uma fonte com catalogo enorme devolve
    varios titulos de score alto e, num sort puro por score, ocuparia o corte
    inteiro. As primeiras posicoes tem que ser uma amostra das fontes vivas."""
    mangadex = [_result("mangadex", str(i), 0.9) for i in range(5)]
    scan_pt = [_result("mangalivre", "a", 0.5)]

    picked = CatalogService._interleave([mangadex, scan_pt], limit=3)

    assert [item.source for item in picked] == ["mangadex", "mangalivre", "mangadex"]


def test_interleave_ordena_por_score_dentro_da_rodada() -> None:
    baixo = [_result("mangadex", "a", 0.4)]
    alto = [_result("mangalivre", "b", 0.95)]

    picked = CatalogService._interleave([baixo, alto], limit=2)

    assert [item.source for item in picked] == ["mangalivre", "mangadex"]


def test_interleave_preenche_com_quem_sobrou_quando_fonte_esgota() -> None:
    """Scans PT-BR tem catalogo pequeno e se esgotam antes do limite; quem
    ainda tem candidato precisa preencher o resto em vez de truncar."""
    mangadex = [_result("mangadex", str(i), 0.9 - i / 100) for i in range(4)]
    scan_pt = [_result("mangalivre", "a", 0.5)]

    picked = CatalogService._interleave([mangadex, scan_pt], limit=5)

    assert len(picked) == 5
    assert sum(1 for item in picked if item.source == "mangalivre") == 1


def test_interleave_respeita_o_limite() -> None:
    batches = [[_result("mangadex", str(i), 0.9) for i in range(20)]]

    assert len(CatalogService._interleave(batches, limit=6)) == 6


def test_interleave_descarta_duplicata_da_mesma_fonte_e_id() -> None:
    # A mesma obra pode voltar em dois batches quando uma fonte responde por
    # mais de um adapter; (source, source_id) e a identidade real.
    repetido = _result("mangadex", "a", 0.9)

    picked = CatalogService._interleave([[repetido], [repetido]], limit=5)

    assert len(picked) == 1


def test_interleave_ignora_fontes_sem_resultado() -> None:
    vivo = [_result("mangadex", "a", 0.9)]

    picked = CatalogService._interleave([[], vivo, []], limit=5)

    assert [item.source_id for item in picked] == ["a"]


def test_interleave_sem_resultado_algum_devolve_lista_vazia() -> None:
    assert CatalogService._interleave([[], []], limit=5) == []


def test_slow_source_does_not_hold_the_aggregated_search(monkeypatch) -> None:
    import asyncio
    import time

    import app.services.catalog as catalog_module
    from app.domain.schemas import SourceInfo
    from app.services.catalog import MemoryTtlCache
    from app.sources.registry import SourceRegistry

    class Fake:
        def __init__(self, source_id: str, delay: float) -> None:
            self._id = source_id
            self._delay = delay

        @property
        def info(self) -> SourceInfo:
            return SourceInfo(id=self._id, name=self._id)

        async def search(self, query: str, limit: int = 10):
            await asyncio.sleep(self._delay)
            return [_result(self._id, "1", 0.9)]

    registry = SourceRegistry()
    registry.register(Fake("rapida", 0))
    registry.register(Fake("lenta", 5))
    monkeypatch.setattr(catalog_module, "SEARCH_SOURCE_TIMEOUT_SECONDS", 0.2)

    service = CatalogService(registry, MemoryTtlCache(ttl_seconds=60))
    started = time.monotonic()
    results = asyncio.run(service.search("x", limit=10))
    assert time.monotonic() - started < 2
    assert [r.source for r in results] == ["rapida"]
