from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_sources_endpoint_lists_mangadex() -> None:
    client = TestClient(app)
    response = client.get("/sources")
    assert response.status_code == 200
    sources = response.json()
    assert sources[0]["id"] == "mangadex"


def test_source_not_found_maps_to_404(monkeypatch):
    from app.sources.base import SourceNotFoundError
    from app.sources.dropescan import DropeScanSource

    async def missing(self, manga_source_id):
        raise SourceNotFoundError("nao existe")

    monkeypatch.setattr(DropeScanSource, "detail", missing)
    with TestClient(app) as test_client:
        response = test_client.get("/manga/dropescan/x")
        assert response.status_code == 404
        assert response.json() == {"detail": "nao existe"}


def test_upstream_404_on_chapters_and_pages_is_404_not_502(monkeypatch):
    import httpx

    from app.sources.mangaflix import MangaFlixSource

    def upstream_404():
        request = httpx.Request("GET", "https://api.mangaflix.net/v1/x")
        response = httpx.Response(404, request=request)
        return httpx.HTTPStatusError("404", request=request, response=response)

    async def chapters(self, manga_source_id, language="pt-br"):
        raise upstream_404()

    async def pages(self, chapter_source_id, data_saver=False):
        raise upstream_404()

    monkeypatch.setattr(MangaFlixSource, "chapters", chapters)
    monkeypatch.setattr(MangaFlixSource, "pages", pages)
    with TestClient(app) as test_client:
        assert test_client.get("/manga/mangaflix/x/chapters").status_code == 404
        assert test_client.get("/chapters/mangaflix/x/pages").status_code == 404
