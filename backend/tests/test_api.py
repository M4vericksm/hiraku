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


def test_source_errors_map_to_404_and_503(monkeypatch):
    from app.sources.base import SourceBusyError, SourceNotFoundError
    from app.sources.dropescan import DropeScanSource

    async def busy(self, manga_source_id, language="pt-br"):
        raise SourceBusyError("ocupada")

    async def missing(self, manga_source_id):
        raise SourceNotFoundError("nao existe")

    monkeypatch.setattr(DropeScanSource, "chapters", busy)
    monkeypatch.setattr(DropeScanSource, "detail", missing)
    with TestClient(app) as test_client:
        response = test_client.get("/manga/dropescan/x/chapters")
        assert response.status_code == 503
        assert response.headers["retry-after"] == "120"
        assert test_client.get("/manga/dropescan/x").status_code == 404
