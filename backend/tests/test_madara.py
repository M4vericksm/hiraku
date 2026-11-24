"""Testes do parsing do adapter Madara, sem rede.

Os fragmentos de HTML abaixo sao reduzidos de paginas reais dos sites
registrados — cada um representa uma variacao de markup que ja quebrou uma
extracao (lazyload em data-src, generos sem bloco genres-content, capitulos
so via AJAX).
"""

import asyncio

import httpx
import pytest

import app.core.http as http_module
from app.sources.madara import (
    MadaraSource,
    _chapter_label,
    _extract_genres,
    _extract_post_id,
    _image_url,
)

SOURCE = MadaraSource(source_id="teste", name="Teste", base_url="https://exemplo.test")


def test_chapter_label_normaliza_prefixo_e_decimal() -> None:
    assert _chapter_label("capitulo-01") == "01"
    assert _chapter_label("capitulo-16-5") == "16.5"
    assert _chapter_label("chapter-7") == "7"
    # Slug sem numero fica intacto em vez de virar "one.shot.especial".
    assert _chapter_label("one-shot-especial") == "one-shot-especial"


def test_image_url_prefere_data_src_sobre_placeholder() -> None:
    attrs = 'id="image-0" src="data:image/gif;base64,R0lGOD" data-src="https://cdn.test/1.jpg"'
    assert _image_url(attrs) == "https://cdn.test/1.jpg"


def test_image_url_aceita_src_quebrado_em_linhas() -> None:
    # O tema indenta o valor do atributo; sem strip a URL sai com \n e \t.
    assert _image_url('id="image-0" src="\n\t\thttps://cdn.test/01.jpg"') == "https://cdn.test/01.jpg"


def test_extract_genres_do_bloco_padrao() -> None:
    html = '<div class="genres-content"><a href="#">Ação</a><a href="#">Aventura</a></div>'
    assert _extract_genres(html) == ["Ação", "Aventura"]


def test_extract_genres_por_link_quando_nao_ha_bloco() -> None:
    html = '<a href="https://exemplo.test/genero/acao/">Ação</a>'
    assert _extract_genres(html) == ["Ação"]


def test_extract_post_id_para_o_ajax_legado() -> None:
    assert _extract_post_id('<body class="postid-268 manga">') == "268"


def test_parse_chapter_links_ignora_feed_e_atalhos() -> None:
    html = (
        '<a href="https://exemplo.test/manga/obra/feed/">RSS</a>'
        '<a href="https://exemplo.test/manga/obra/capitulo-02/">Capítulo 02</a>'
        '<a href="https://exemplo.test/manga/obra/capitulo-01/">Iniciar leitura</a>'
    )
    # "Iniciar leitura" aponta para um capitulo real, mas nao e a listagem —
    # se contasse, o fallback AJAX nunca rodaria.
    assert SOURCE._parse_chapter_links(html, "obra") == [("capitulo-02", "Capítulo 02")]


def test_parse_chapter_links_escapa_o_slug_do_cliente() -> None:
    # Um "." no slug nao pode virar coringa e casar outro manga.
    html = '<a href="https://exemplo.test/manga/aXb/capitulo-01/">Cap 1</a>'
    assert SOURCE._parse_chapter_links(html, "a.b") == []


def test_slug_from_url_respeita_paths_alternativos() -> None:
    source = MadaraSource("s", "S", "https://exemplo.test", manga_paths=("obra", "manga"))
    assert source._slug_from_url("https://exemplo.test/obra/minha-obra/") == "minha-obra"
    assert source._slug_from_url("https://exemplo.test/manga/outra/") == "outra"
    assert source._slug_from_url("https://exemplo.test/autor/fulano/") is None


GRID_SEARCH_HTML = """
<div class="page-listing-item"><div class="page-item-detail manga  ">
  <div class="item-thumb c-image-hover">
    <a href="https://flowermangas.net/manga/obra-um/" title="Obra Um">
      <img src="https://flowermangas.net/wp-content/uploads/um.jpg" /></a>
  </div>
</div></div>
"""

MANGA_ITEM_SEARCH_HTML = """
<div class="search-lists"><div class="manga__item ">
  <div class="manga__thumb"><a href="https://arthurscan.xyz/manga/obra-dois/">
    <img src="https://arthurscan.xyz/wp-content/uploads/dois.webp" /></a></div>
  <div class="manga__content"><div class="post-title font-title"><h2>
    <a href="https://arthurscan.xyz/manga/obra-dois/"> Obra &amp; Dois </a>
  </h2></div></div>
</div></div>
"""


@pytest.mark.parametrize(
    ("markup", "slug", "title"),
    [
        (GRID_SEARCH_HTML, "obra-um", "Obra Um"),
        (MANGA_ITEM_SEARCH_HTML, "obra-dois", "Obra & Dois"),
    ],
)
def test_search_understands_grid_and_manga_item_layouts(monkeypatch, markup, slug, title):
    # Variantes do Madara (Flower Mangas, Arthur Scan) nao usam o bloco
    # `c-tabs-item__content`; sem isso a busca voltava sempre vazia.
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text=markup))
    )
    monkeypatch.setattr(http_module, "_client", client)
    source = MadaraSource(source_id="x", name="X", base_url="https://example.com")
    found = asyncio.run(source._search_page("obra", 1))
    assert [(item[0], item[1]) for item in found] == [(slug, title)]
