"""MangaFlix: mapeamento da API JSON (busca, obra, capitulos, paginas)."""

import asyncio

import httpx
import pytest

import app.core.http as http_module
from app.sources.mangaflix import MangaFlixSource

WORK = {
    "_id": "w1",
    "name": "One Piece",
    "description": "Piratas.",
    "poster": {"default_url": "https://static.mangaflix.net/up/p.jpg"},
    "genres": ["g1", "g2"],
    "chapters": [
        {"_id": "c2", "number": "2", "number_of_pages": 18},
        {"_id": "c1", "number": "1", "number_of_pages": 20},
        {"_id": "c1", "number": "1"},
    ],
}


def _handler(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path.endswith("/search/mangas"):
        return httpx.Response(200, json={"data": {"works": [WORK, {"_id": "w2", "name": "One Piece Party"}]}})
    if path.endswith("/mangas/w1"):
        return httpx.Response(200, json={"data": WORK})
    if path.endswith("/genres"):
        return httpx.Response(200, json={"data": [{"_id": "g1", "name": "Ação"}, {"_id": "g2", "name": "Aventura"}]})
    if path.endswith("/chapters/c1"):
        return httpx.Response(
            200,
            json={"data": {"images": [
                {"default_url": "https://cdn.mangaflix.net/2.jpg", "order": 2},
                {"default_url": "https://cdn.mangaflix.net/1.jpg", "order": 1},
            ]}},
        )
    return httpx.Response(404)


@pytest.fixture(autouse=True)
def mock_client(monkeypatch):
    client = httpx.AsyncClient(transport=httpx.MockTransport(_handler))
    monkeypatch.setattr(http_module, "_client", client)
    yield


def test_search_ranks_exact_title_first():
    results = asyncio.run(MangaFlixSource().search("one piece"))
    assert [r.source_id for r in results] == ["w1", "w2"]
    assert results[0].cover_url == "https://static.mangaflix.net/up/p.jpg"


def test_detail_resolves_genre_names():
    detail = asyncio.run(MangaFlixSource().detail("w1"))
    assert detail.title == "One Piece"
    assert detail.genres  # ids viraram generos canonicos


def test_detail_accepts_genre_objects(monkeypatch):
    work = {**WORK, "genres": [{"_id": "g9", "name": "Romance"}]}

    async def fake_work(self, manga_source_id):
        return work

    monkeypatch.setattr(MangaFlixSource, "_work", fake_work)
    detail = asyncio.run(MangaFlixSource().detail("w1"))
    assert detail.genres == ["romance"]


def test_chapters_are_sorted_and_deduplicated():
    chapters = asyncio.run(MangaFlixSource().chapters("w1"))
    assert [c.chapter for c in chapters] == ["1", "2"]
    assert chapters[0].title == "Capítulo 1"


def test_pages_follow_image_order():
    pages = asyncio.run(MangaFlixSource().pages("c1"))
    assert pages.page_urls == ["https://cdn.mangaflix.net/1.jpg", "https://cdn.mangaflix.net/2.jpg"]
