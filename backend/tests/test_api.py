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
