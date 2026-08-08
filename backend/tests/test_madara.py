"""Testes do parsing do adapter Madara, sem rede.

Os fragmentos de HTML abaixo sao reduzidos de paginas reais dos sites
registrados — cada um representa uma variacao de markup que ja quebrou uma
extracao (lazyload em data-src, generos sem bloco genres-content, capitulos
so via AJAX).
"""

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
