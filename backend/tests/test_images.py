import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.images import is_allowed, needs_proxy, proxy_url, referer_for

client = TestClient(app)


@pytest.mark.parametrize(
    "url",
    [
        "https://uploads.mangadex.org/covers/abc/def.jpg",
        "https://cmdxd98sb0x3yprd.mangadex.network/data/abc/1.jpg",
        "https://mangalivre.to/wp-content/uploads/1.webp",
    ],
)
def test_allows_known_source_hosts(url):
    assert is_allowed(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/evil.jpg",  # proxy aberto
        "http://127.0.0.1:8000/health",  # SSRF para a propria rede
        "http://169.254.169.254/latest/meta-data/",  # metadata de cloud
        "file:///etc/passwd",  # esquema nao suportado
        "https://uploads.mangadex.org.evil.com/a.jpg",  # sufixo falsificado
    ],
)
def test_rejects_untrusted_urls(url):
    assert not is_allowed(url)


def test_mangadex_images_skip_the_proxy():
    """MangaDex ja envia CORS, entao nao precisa passar pelo nosso servidor."""
    assert not needs_proxy("https://uploads.mangadex.org/covers/a/b.jpg")
    assert not needs_proxy("https://cmdxd98sb0x3yprd.mangadex.network/data/a/1.jpg")


def test_mangalivre_images_need_the_proxy():
    assert needs_proxy("https://mangalivre.to/wp-content/uploads/1.webp")


def test_proxy_url_escapes_the_original_url():
    built = proxy_url("https://mangalivre.to/a b.webp?x=1&y=2")
    assert built.startswith("/image?url=")
    assert "&y=2" not in built  # o & foi escapado, nao virou outro parametro
    assert "%26y%3D2" in built


def test_referer_is_sent_only_where_required():
    assert referer_for("https://mangalivre.to/a.webp") == "https://mangalivre.to/"
    assert referer_for("https://uploads.mangadex.org/a.jpg") is None


def test_image_endpoint_rejects_untrusted_host():
    response = client.get("/image", params={"url": "https://example.com/a.jpg"})
    assert response.status_code == 400


def test_image_endpoint_requires_url():
    assert client.get("/image").status_code == 422
