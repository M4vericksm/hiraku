"""Proxy de imagens das fontes.

Fontes como o MangaLivre servem as imagens sem cabecalho CORS. Isso funciona
em uma tag <img>, mas o navegador bloqueia `fetch()` — que e exatamente como o
download offline le os bytes da pagina. O proxy resolve isso servindo a imagem
a partir do nosso proprio dominio, com o Referer que a fonte espera.
"""

from urllib.parse import quote, urlparse

import httpx

ALLOWED_HOSTS = {
    "uploads.mangadex.org",
    "mangalivre.to",
    "www.mangalivre.to",
}

ALLOWED_HOST_SUFFIXES = (
    ".mangadex.network",
    ".mangadex.org",
    ".mangalivre.to",
)

REFERERS = {
    "mangalivre.to": "https://mangalivre.to/",
}

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

MAX_IMAGE_BYTES = 20 * 1024 * 1024

# Hosts que respondem com Access-Control-Allow-Origin. Imagens desses hosts
# podem ir direto para o navegador; as demais precisam passar pelo proxy para
# que o download offline (fetch + blob) nao seja bloqueado.
CORS_SAFE_HOST_SUFFIXES = (
    "uploads.mangadex.org",
    ".mangadex.network",
)


def needs_proxy(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return not any(
        host == suffix.lstrip(".") or host.endswith(suffix)
        for suffix in CORS_SAFE_HOST_SUFFIXES
    )


def proxy_url(url: str) -> str:
    """Reescreve a URL da fonte para o nosso endpoint de proxy."""
    return f"/image?url={quote(url, safe='')}"


class ImageProxyError(ValueError):
    """URL recusada antes de qualquer requisicao de rede."""


def is_allowed(url: str) -> bool:
    """Só deixa passar imagens dos hosts das fontes que suportamos.

    Sem essa checagem o endpoint viraria um proxy aberto, utilizavel por
    terceiros para mascarar trafego atraves do nosso servidor.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False

    host = (parsed.hostname or "").lower()
    if not host:
        return False
    if host in ALLOWED_HOSTS:
        return True
    return host.endswith(ALLOWED_HOST_SUFFIXES)


def referer_for(url: str) -> str | None:
    host = (urlparse(url).hostname or "").lower()
    for suffix, referer in REFERERS.items():
        if host == suffix or host.endswith(f".{suffix}"):
            return referer
    return None


def upstream_headers(url: str) -> dict[str, str]:
    headers = {"User-Agent": BROWSER_USER_AGENT}
    referer = referer_for(url)
    if referer:
        headers["Referer"] = referer
    return headers


async def fetch_image(url: str, client: httpx.AsyncClient) -> tuple[bytes, str]:
    """Baixa uma imagem da fonte e devolve (bytes, content_type)."""
    if not is_allowed(url):
        raise ImageProxyError(f"Host nao permitido: {url}")

    response = await client.get(url, headers=upstream_headers(url))
    response.raise_for_status()

    content_type = response.headers.get("content-type", "image/jpeg")
    if not content_type.startswith("image/"):
        raise ImageProxyError(f"Resposta nao e uma imagem: {content_type}")
    if len(response.content) > MAX_IMAGE_BYTES:
        raise ImageProxyError("Imagem excede o tamanho maximo permitido")

    return response.content, content_type
