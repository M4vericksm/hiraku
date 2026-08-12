"""Parsing do MangaLivre Blog.

Os HTMLs abaixo sao recortes do markup real do site (obra e capitulo), com o
suficiente para exercitar cada extracao. O objetivo e travar as diferencas
que fazem esse site nao ser Madara: `chapter-link` em vez de link sob o path
da obra, `chapter-image` em vez de `wp-manga-chapter-img`.
"""

from app.sources.madara import ID_SEPARATOR
from app.sources.mangalivreblog import (
    MangaLivreBlogSource,
    _chapter_links,
    _clean,
    _description,
    _embedded_cover,
    _genres,
    _number_from_label,
    _page_urls,
)

MANGA_HTML = """
<div class="manga-actions">
  <a href="https://mangalivre.blog/capitulo/one-piece-capitulo-1190/" class="start-reading-btn">
    Iniciar Leitura
  </a>
</div>
<div class="chapters-container list-mode">
  <ul class="chapters-list">
    <li class="chapter-item"><div class="chapter-details">
      <a href="https://mangalivre.blog/capitulo/one-piece-capitulo-1190/" class="chapter-link">
        <span class="chapter-number"> Cap&iacute;tulo 1190 </span>
      </a>
    </div></li>
    <li class="chapter-item"><div class="chapter-details">
      <a href="https://mangalivre.blog/capitulo/one-piece-capitulo-1189-5/" class="chapter-link">
        <span class="chapter-number"> Cap&iacute;tulo 1189.5 </span>
      </a>
    </div></li>
  </ul>
</div>
"""

CHAPTER_HTML = """
<div class="manga-cover"><img src="https://mangalivre.blog/wp-content/uploads/capa.jpg"></div>
<div class="chapter-content"><div class="chapter-reader"><div class="chapter-images">
  <div class="chapter-image-container" id="page-1" data-page="1">
    <img src="https://mangalivre.blog/wp-content/uploads/2026/08/imgi_1_a.webp"
         alt="P&aacute;gina 1" class="chapter-image" loading="lazy">
  </div>
  <div class="chapter-image-container" id="page-2" data-page="2">
    <img data-src="https://mangalivre.blog/wp-content/uploads/2026/08/imgi_2_b.webp"
         src="data:image/gif;base64,R0lGOD" class="chapter-image" loading="lazy">
  </div>
</div></div></div>
"""


def test_chapter_links_are_read_from_the_manga_page() -> None:
    links = _chapter_links(MANGA_HTML)
    assert [slug for slug, _ in links] == [
        "one-piece-capitulo-1190",
        "one-piece-capitulo-1189-5",
    ]


def test_start_reading_button_is_not_taken_as_a_chapter() -> None:
    # O botao aponta para o mesmo capitulo mas com rotulo "Iniciar Leitura";
    # sem filtrar, a lista ganharia uma entrada duplicada e sem numero.
    assert all("Iniciar" not in label for _, label in _chapter_links(MANGA_HTML))


def test_page_urls_come_from_chapter_image_tags() -> None:
    # A capa da obra tambem e um <img> na mesma pagina, mas sem a classe.
    assert _page_urls(CHAPTER_HTML) == [
        "https://mangalivre.blog/wp-content/uploads/2026/08/imgi_1_a.webp",
        "https://mangalivre.blog/wp-content/uploads/2026/08/imgi_2_b.webp",
    ]


def test_lazyloaded_page_prefers_data_src_over_the_placeholder() -> None:
    assert "base64" not in "".join(_page_urls(CHAPTER_HTML))


def test_number_is_extracted_from_the_label() -> None:
    assert _number_from_label("Capítulo 1190") == "1190"
    assert _number_from_label("Capítulo 1189.5") == "1189.5"


def test_label_without_number_is_kept_as_is() -> None:
    assert _number_from_label("Extra") == "Extra"


def test_embedded_cover_reads_the_featured_media() -> None:
    item = {"_embedded": {"wp:featuredmedia": [{"source_url": "https://x/c.jpg"}]}}
    assert _embedded_cover(item) == "https://x/c.jpg"


def test_missing_embedded_cover_is_none_instead_of_raising() -> None:
    # `_embed` nao vem quando a obra nao tem imagem destacada.
    assert _embedded_cover({}) is None
    assert _embedded_cover({"_embedded": {"wp:featuredmedia": []}}) is None


SYNOPSIS_HTML = """
<div class="manga-synopsis">
  <h3>Sinopse</h3>
  <div class="synopsis-content">
    <p>Gol D. Roger foi executado pelo Governo Mundial.</p>
    <p>Vinte e dois anos depois, Luffy parte em sua jornada.</p>
  </div>
</div>
<div class="manga-tags">
  <span class="manga-tag">Action</span>
  <span class="manga-tag">Adventure</span>
  <span class="manga-tag">Action</span>
</div>
"""


def test_description_skips_the_synopsis_heading() -> None:
    # Mirar no container externo traria junto o <h3>Sinopse</h3> e a descricao
    # exibida comecaria com a palavra "Sinopse".
    description = _description(SYNOPSIS_HTML)
    assert description is not None
    assert description.startswith("Gol D. Roger")


def test_description_joins_paragraphs_with_a_single_space() -> None:
    # Os <p> vem indentados no HTML; sem colapsar, o texto chega ao frontend
    # com quebra de linha e recuo no meio da frase.
    assert "executado pelo Governo Mundial. Vinte e dois anos" in _description(SYNOPSIS_HTML)


def test_tags_become_genres_without_repeating() -> None:
    assert _genres(SYNOPSIS_HTML) == ["Action", "Adventure"]


def test_clean_does_not_glue_words_split_by_tags() -> None:
    assert _clean("<span>Ação</span><span>Aventura</span>") == "Ação Aventura"


def test_chapter_source_id_keeps_the_madara_shape() -> None:
    # O resto do backend (e os favoritos ja salvos) espera "obra___capitulo".
    source = MangaLivreBlogSource()
    assert source.info.id == "mangalivreblog"
    assert ID_SEPARATOR == "___"
