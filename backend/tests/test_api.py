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


def test_popular_endpoint_rejects_unknown_source() -> None:
    client = TestClient(app)
    response = client.get("/manga/popular", params={"source": "fonte-que-nao-existe"})
    assert response.status_code == 404


def test_popular_route_is_not_shadowed_by_the_detail_route() -> None:
    """'/manga/popular' nao pode ser lido como '/manga/{source}/{id}'."""
    paths = app.openapi()["paths"]
    assert "/manga/popular" in paths
    assert "get" in paths["/manga/popular"]
