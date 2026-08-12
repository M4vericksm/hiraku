import pytest

from app.sources.mangalivreblog import MangaLivreBlogSource
from app.sources.registry import (
    PTBR_MADARA_SOURCES,
    SourceRegistry,
    UnknownSourceError,
    default_registry,
)


def test_default_registry_exposes_mangadex() -> None:
    registry = default_registry()
    assert registry.get("mangadex").info.name == "MangaDex"


def test_registry_raises_for_unknown_source() -> None:
    registry = SourceRegistry()
    with pytest.raises(UnknownSourceError):
        registry.get("missing")


def test_every_declared_madara_source_is_registered() -> None:
    registry = default_registry()
    for source_def in PTBR_MADARA_SOURCES:
        source_id, name = source_def[0], source_def[1]
        assert registry.get(source_id).info.name == name


def test_declared_source_ids_are_unique() -> None:
    ids = [source_def[0] for source_def in PTBR_MADARA_SOURCES]
    assert len(ids) == len(set(ids))


def test_mangalivre_blog_is_registered_with_its_own_adapter() -> None:
    # O site nao e Madara (tema proprio, sem c-tabs-item__content e sem
    # ajax/chapters), entao tratar como MadaraSource devolvia busca vazia.
    adapter = default_registry().get("mangalivreblog")
    assert adapter.info.name == "MangaLivre Blog"
    assert isinstance(adapter, MangaLivreBlogSource)


def test_mangalivre_blog_is_not_declared_as_madara() -> None:
    assert "mangalivreblog" not in {source_def[0] for source_def in PTBR_MADARA_SOURCES}


def test_mangalivre_org_is_not_registered() -> None:
    # A API da SPA serve busca e lista de capitulos, mas `/chapters/<id>` da
    # 404 para todo id (UUID e legacyId), entao nenhuma obra abre. Catalogo
    # grande sem pagina so encheria a busca de resultado que da erro.
    with pytest.raises(UnknownSourceError):
        default_registry().get("mangalivreorg")


def test_mangalivre_net_is_not_registered() -> None:
    # O dominio virou landing de despedida apontando para as editoras
    # oficiais; nao tem catalogo proprio para buscar.
    with pytest.raises(UnknownSourceError):
        default_registry().get("mangalivrenet")


def test_source_without_4th_field_keeps_default_manga_path() -> None:
    # Quem nao declara `manga_paths` serve as obras sob /manga/ mesmo.
    assert default_registry().get("kamisama")._manga_paths == ("manga",)


def test_4th_field_overrides_manga_path() -> None:
    # inkapk publica em /obras/; sem repassar a 4a posicao da tupla o adapter
    # montaria /manga/<slug>/ e todo detalhe viria 404.
    assert default_registry().get("inkapk")._manga_paths == ("obras",)
