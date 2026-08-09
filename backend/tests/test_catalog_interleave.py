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
