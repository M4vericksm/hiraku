import pytest
from fastapi.testclient import TestClient

from app.main import app
import asyncio

import httpx

from app.services.images import (
    ImageProxyError,
    fetch_image,
    is_allowed,
    needs_proxy,
    proxy_url,
    referer_for,
    sniff_image_type,
)

client = TestClient(app)


@pytest.mark.parametrize(
    "url",
    [
        "https://uploads.mangadex.org/covers/abc/def.jpg",
        "https://cmdxd98sb0x3yprd.mangadex.network/data/abc/1.jpg",
        "https://mangalivre.to/wp-content/uploads/1.webp",
        "https://mangalivre.blog/wp-content/uploads/1.webp",
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
    """MangaDex ja envia CORS, entao nao precisa passar pelo nosso servidor.

    Pelo proxy as capas tambem nao viriam: o MangaDex responde ao IP do
    servidor com desafio anti-bot.
    """
    assert not needs_proxy("https://uploads.mangadex.org/covers/a/b.jpg")
    assert not needs_proxy("https://cmdxd98sb0x3yprd.mangadex.network/data/a/1.jpg")


def test_madara_images_need_the_proxy():
    assert needs_proxy("https://mangalivre.to/wp-content/uploads/1.webp")
    assert needs_proxy("https://mangalivre.blog/wp-content/uploads/1.webp")


def test_mangalivre_org_is_not_a_trusted_host():
    # A fonte foi descartada (a API nao expoe as imagens das paginas), entao o
    # dominio nao pode continuar valendo passe livre no proxy.
    assert not is_allowed("https://mangalivre.org/wp-content/uploads/1.webp")


def test_proxy_url_escapes_the_original_url():
    built = proxy_url("https://mangalivre.to/a b.webp?x=1&y=2")
    assert built.startswith("/image?url=")
    assert "&y=2" not in built  # o & foi escapado, nao virou outro parametro
    assert "%26y%3D2" in built


def test_referer_is_sent_only_where_required():
    assert referer_for("https://mangalivre.to/a.webp") == "https://mangalivre.to/"
    assert referer_for("https://cdn.mangalivre.blog/a.webp") == "https://mangalivre.blog/"
    assert referer_for("https://uploads.mangadex.org/a.jpg") is None


def test_image_endpoint_rejects_untrusted_host():
    response = client.get("/image", params={"url": "https://example.com/a.jpg"})
    assert response.status_code == 400


def test_image_endpoint_requires_url():
    assert client.get("/image").status_code == 422


def test_mangalivre_blog_cdn_is_allowed_with_site_referer():
    # Capas e paginas do mangalivre.blog vem dessa CDN; sem ela na allowlist
    # o proxy recusava tudo e o leitor da fonte abria vazio.
    url = "https://livre.xn--c5wx58dnej.online/mui/slimeread/1/page-001.webp"
    assert is_allowed(url)
    assert referer_for(url) == "https://mangalivre.blog/"


WEBP_HEAD = b"RIFF\x00\x00\x00\x00WEBPVP8 "


def _client_returning(body: bytes, content_type: str) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body, headers={"content-type": content_type})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (b"\xff\xd8\xff\xe0", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\n", "image/png"),
        (WEBP_HEAD, "image/webp"),
        (b"GIF89a", "image/gif"),
        (b"<!doctype html>", None),
    ],
)
def test_sniff_image_type(head, expected):
    assert sniff_image_type(head) == expected


def test_octet_stream_webp_is_served_as_webp():
    # A CDN da Monte Tai serve .webp como application/octet-stream; o proxy
    # recusava a pagina e o capitulo abria em branco.
    url = "https://cdn.montetaiscanlator.xyz/manga/x/1/001.webp"
    client = _client_returning(WEBP_HEAD + b"resto", "application/octet-stream")
    body, content_type = asyncio.run(fetch_image(url, client))
    assert content_type == "image/webp"
    assert body.startswith(b"RIFF")


def test_octet_stream_that_is_not_an_image_is_rejected():
    url = "https://cdn.montetaiscanlator.xyz/manga/x/1/001.webp"
    client = _client_returning(b"<html>erro</html>", "application/octet-stream")
    with pytest.raises(ImageProxyError):
        asyncio.run(fetch_image(url, client))


def test_html_content_type_is_rejected_without_sniffing():
    url = "https://cdn.montetaiscanlator.xyz/manga/x/1/001.webp"
    client = _client_returning(WEBP_HEAD, "text/html")
    with pytest.raises(ImageProxyError):
        asyncio.run(fetch_image(url, client))
