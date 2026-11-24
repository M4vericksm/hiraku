"""Protecoes de borda: limite por IP, cabecalhos, SVG e rede interna no proxy."""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

import app.core.security as security
import app.services.images as images
from app.core.security import SlidingWindowLimiter, client_ip, limit_for
from app.main import app, create_app
from app.services.images import ImageProxyError, fetch_image


def test_limiter_blocks_after_quota_and_frees_after_window():
    limiter = SlidingWindowLimiter()
    key = ("1.2.3.4", "search")
    assert all(limiter.hit(key, 3, now=0) == 0 for _ in range(3))
    assert limiter.hit(key, 3, now=1) > 0
    assert limiter.hit(key, 3, now=61) == 0  # janela de 60 s passou


def test_limits_are_per_ip_and_per_bucket():
    limiter = SlidingWindowLimiter()
    assert limiter.hit(("a", "search"), 1, now=0) == 0
    assert limiter.hit(("b", "search"), 1, now=0) == 0
    assert limiter.hit(("a", "image"), 1, now=0) == 0
    assert limiter.hit(("a", "search"), 1, now=0) > 0


def test_generous_buckets_and_health_exempt():
    assert limit_for("/health") is None
    assert limit_for("/image").per_minute >= 600  # download de capitulo inteiro
    assert limit_for("/manga/search").per_minute >= 60


def test_client_ip_prefers_cloudflare_header():
    scope = {"headers": [(b"cf-connecting-ip", b"203.0.113.9")], "client": ("172.18.0.5", 1)}
    assert client_ip(scope) == "203.0.113.9"
    assert client_ip({"headers": [], "client": ("10.0.0.1", 1)}) == "10.0.0.1"


def test_429_keeps_cors_and_retry_after(monkeypatch):
    monkeypatch.setattr(security, "DEFAULT_LIMIT", security.Limit("default", 2))
    with TestClient(create_app()) as client:
        headers = {"Origin": "http://localhost", "CF-Connecting-IP": "198.51.100.7"}
        codes = [client.get("/sources", headers=headers).status_code for _ in range(3)]
        blocked = client.get("/sources", headers=headers)
    assert codes[:2] == [200, 200] and blocked.status_code == 429
    assert blocked.headers["retry-after"]
    # Sem CORS no 429 o app mostraria "erro de rede" em vez do motivo real.
    assert blocked.headers["access-control-allow-origin"] == "http://localhost"


def test_security_headers_on_every_response():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"


def test_cors_does_not_allow_credentials():
    with TestClient(app) as client:
        response = client.get("/health", headers={"Origin": "http://localhost"})
    assert response.headers["access-control-allow-origin"] == "http://localhost"
    assert "access-control-allow-credentials" not in response.headers


def test_upstream_details_do_not_leak(monkeypatch):
    from app.sources.mangaflix import MangaFlixSource

    async def boom(self, query, limit=10):
        raise httpx.ConnectError("falhou em http://10.0.0.5:9000/segredo")

    monkeypatch.setattr(MangaFlixSource, "search", boom)
    with TestClient(app) as client:
        response = client.get("/manga/search", params={"q": "abc", "source": "mangaflix"})
    assert "10.0.0.5" not in response.text


def _client(body: bytes, content_type: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, content=body, headers={"content-type": content_type})
        )
    )


def test_proxy_rejects_svg():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    with pytest.raises(ImageProxyError):
        asyncio.run(fetch_image("https://mangalivre.to/a.svg", _client(svg, "image/svg+xml")))


@pytest.mark.parametrize("address", ["127.0.0.1", "172.18.0.3", "10.1.2.3", "169.254.169.254", "::1"])
def test_proxy_rejects_hosts_pointing_inside(monkeypatch, address):
    async def internal(host):
        return [address]

    monkeypatch.setattr(images, "resolve_ips", internal)
    with pytest.raises(ImageProxyError):
        asyncio.run(fetch_image("https://mangalivre.to/a.jpg", _client(b"\xff\xd8\xff", "image/jpeg")))


def test_image_response_is_sandboxed(monkeypatch):
    async def fake_fetch(url, client, timeout=None):
        return b"\xff\xd8\xff", "image/jpeg"

    monkeypatch.setattr("app.api.routes.fetch_image", fake_fetch)
    with TestClient(app) as client:
        response = client.get("/image", params={"url": "https://mangalivre.to/a.jpg"})
    assert response.status_code == 200
    assert "sandbox" in response.headers["content-security-policy"]
    assert response.headers["cross-origin-resource-policy"] == "cross-origin"


def test_docs_can_be_disabled(monkeypatch):
    import app.main as main_module
    from app.core.config import Settings

    monkeypatch.setenv("HIRAKU_DOCS", "0")
    monkeypatch.setattr(main_module, "settings", Settings())
    with TestClient(main_module.create_app()) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
        assert client.get("/health").status_code == 200


# ---------- segunda revisao ----------


@pytest.mark.parametrize(
    "path",
    [
        "/manga/pinkrosa/..%2F..%2Fadmin",
        "/manga/montetai/obra%20com%20espaco",
        "/manga/MontéTai/obra",
        "/manga/montetai/" + "a" * 301,
        "/manga/montetai/x;rm/chapters",
        "/chapters/montetai/a%3Fb%3Dc/pages",
    ],
)
def test_suspicious_ids_are_404_before_any_upstream_call(monkeypatch, path):
    from app.services.catalog import CatalogService

    async def boom(*args, **kwargs):
        raise AssertionError("nao devia chegar na fonte")

    for name in ("detail", "chapters", "pages"):
        monkeypatch.setattr(CatalogService, name, boom)
    with TestClient(app) as client:
        assert client.get(path).status_code == 404


def test_real_looking_ids_still_reach_the_service(monkeypatch):
    from app.domain.schemas import ChapterPages
    from app.services.catalog import CatalogService

    async def pages(self, source, chapter_id, data_saver=False):
        return ChapterPages(source=source, source_chapter_id=chapter_id, page_urls=[])

    monkeypatch.setattr(CatalogService, "pages", pages)
    with TestClient(app) as client:
        for chapter_id in (
            "despertei-um-talento___capitulo-1",
            "2896698091458584335",
            "6a206dafa3c6e878d063d143",
            "obra-%e3%81%82___cap-10.5",
            "coração-de-pêssego___capítulo-2",
        ):
            assert client.get(f"/chapters/montetai/{chapter_id}/pages").status_code == 200


def test_search_query_has_a_max_length():
    with TestClient(app) as client:
        assert client.get("/manga/search", params={"q": "x" * 101}).status_code == 422


def test_ipv6_clients_share_the_limit_of_their_64():
    from app.core.security import client_key

    a = {"headers": [(b"cf-connecting-ip", b"2001:db8:1:2:aaaa::1")]}
    b = {"headers": [(b"cf-connecting-ip", b"2001:db8:1:2:bbbb::9")]}
    other = {"headers": [(b"cf-connecting-ip", b"2001:db8:1:3::1")]}
    assert client_key(a) == client_key(b) == "2001:db8:1:2::/64"
    assert client_key(other) != client_key(a)
    assert client_key({"headers": [(b"cf-connecting-ip", b"203.0.113.9")]}) == "203.0.113.9"


def test_image_byte_budget(monkeypatch):
    monkeypatch.setattr(security, "IMAGE_BYTES_PER_MINUTE", 10)

    async def fake_fetch(url, client, timeout=None):
        return b"\xff\xd8\xff" + b"0" * 7, "image/jpeg"  # 10 bytes

    monkeypatch.setattr("app.api.routes.fetch_image", fake_fetch)
    with TestClient(create_app()) as client:
        headers = {"CF-Connecting-IP": "198.51.100.20"}
        params = {"url": "https://mangalivre.to/a.jpg"}
        first = client.get("/image", params=params, headers=headers)
        second = client.get("/image", params=params, headers=headers)
        other_ip = client.get("/image", params=params, headers={"CF-Connecting-IP": "198.51.100.21"})
    assert first.status_code == 200
    assert second.status_code == 429 and second.headers["retry-after"]
    assert other_ip.status_code == 200


def test_source_searches_have_a_global_ceiling(monkeypatch):
    import app.services.catalog as catalog_module

    monkeypatch.setattr(catalog_module, "MAX_PARALLEL_SOURCE_SEARCHES", 2)
    monkeypatch.setattr(catalog_module, "_search_slots", None)
    running = 0
    peak = 0

    async def slow():
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return []

    async def main():
        await asyncio.gather(*[catalog_module._bounded(slow()) for _ in range(10)])

    asyncio.run(main())
    assert peak == 2


def test_image_cors_is_public_so_edge_cache_is_safe(monkeypatch):
    async def fake_fetch(url, client, timeout=None):
        return b"\xff\xd8\xff", "image/jpeg"

    monkeypatch.setattr("app.api.routes.fetch_image", fake_fetch)
    with TestClient(app) as client:
        responses = [
            client.get("/image", params={"url": "https://mangalivre.to/a.jpg"}, headers={"Origin": o})
            for o in ("http://localhost", "https://localhost", "https://evil.example")
        ]
        api = client.get("/sources", headers={"Origin": "http://localhost"})
    for response in responses:
        # Mesma resposta para qualquer origem: a copia em cache serve a todos.
        assert response.headers["access-control-allow-origin"] == "*"
        assert "origin" not in response.headers.get("vary", "").lower()
        assert "access-control-allow-credentials" not in response.headers
    # O resto da API continua restrito as origens do app.
    assert api.headers["access-control-allow-origin"] == "http://localhost"
