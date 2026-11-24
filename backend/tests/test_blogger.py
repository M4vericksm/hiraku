"""Scans no Blogger: extracao de paginas, numero do capitulo e rotulo da serie."""

import asyncio

from app.sources.blogger import (
    BloggerSite,
    BloggerSource,
    _chapter_feed_label,
    _chapter_number,
    _cover,
    extract_page_urls,
)

IMG = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvX"


def test_pages_from_img_tags_skip_thumbnails():
    content = (
        f'<img src="{IMG}a/s72-c/thumb.jpg"/>'
        f'<div class="separator"><img src="{IMG}b/s1600/1.jpg"/></div>'
        f'<img src="{IMG}c/s1600/2.jpg"/><img src="{IMG}b/s1600/1.jpg"/>'
    )
    assert extract_page_urls(content) == [f"{IMG}b/s1600/1.jpg", f"{IMG}c/s1600/2.jpg"]


def test_pages_from_script_array():
    # Traducoes do Lipe guarda as paginas numa lista em script.
    content = f'<script>wz_pages_chapter=[ "{IMG}x/s1600/1.jpg", "{IMG}y/s1600/2.jpg"]</script>'
    assert extract_page_urls(content) == [f"{IMG}x/s1600/1.jpg", f"{IMG}y/s1600/2.jpg"]


def test_chapter_number_from_titles():
    assert _chapter_number("Chapter 56") == "56"
    assert _chapter_number("Capítulo 10,5") == "10.5"
    assert _chapter_number("O Fantasma Chapter 26") == "26"
    assert _chapter_number("One shot") is None


def test_chapter_feed_label_markers():
    assert _chapter_feed_label('<div class="chapter_get" data-labelchapter="Introvertidos">') == (
        "Introvertidos"
    )
    assert _chapter_feed_label("<script>clwd.run('Gal ni Yasashii')</script>") == "Gal ni Yasashii"
    assert _chapter_feed_label("<script>var label = 'Share button'</script>") is None


def test_cover_upscales_feed_thumbnail():
    entry = {"media$thumbnail": {"url": f"{IMG}z/s72-c/capa.jpg"}}
    assert _cover(entry) == f"{IMG}z/s400/capa.jpg"


def test_cover_upscales_suffix_style_thumbnail():
    entry = {"media$thumbnail": {"url": f"{IMG}z=s72-c"}}
    assert _cover(entry) == f"{IMG}z=s400"


def test_series_label_candidates_skip_genres_and_scores(monkeypatch):
    site = BloggerSite("x", "X", "https://x.blogspot.com", chapter_label="Capítulo")
    source = BloggerSource(site)

    async def no_page(self, entry):
        return None

    monkeypatch.setattr(BloggerSource, "_page_html", no_page)
    entry = {
        "title": {"$t": "Obra Boa"},
        "content": {"$t": "<p>sinopse</p>"},
        "category": [
            {"term": "Isekai"},
            {"term": "Score 7.0"},
            {"term": "Ativo"},
            {"term": "Obra Boa"},
            {"term": "Capítulo"},
        ],
    }
    assert asyncio.run(source._series_label_candidates(entry)) == ["Obra Boa"]
