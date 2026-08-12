"""Proxy de imagens das fontes.

Fontes como o MangaLivre servem as imagens sem cabecalho CORS. Isso funciona
em uma tag <img>, mas o navegador bloqueia `fetch()` — que e exatamente como o
download offline le os bytes da pagina. O proxy resolve isso servindo a imagem
a partir do nosso proprio dominio, com o Referer que a fonte espera.
"""

from urllib.parse import quote, urljoin, urlparse

import httpx

ALLOWED_HOSTS = {
    "uploads.mangadex.org",
    "mangalivre.to",
    "www.mangalivre.to",
    "mangalivre.blog",
    "www.mangalivre.blog",
    "leitor.kamisama.com.br",
    "montetaiscanlator.xyz",
    "ninjacomics.xyz",
    "euphoriascan.com",
    "fbsquadx.com",
    "ghostscan.xyz",
    "inkapk.net",
    "hanamiheaven.org",
}

ALLOWED_HOST_SUFFIXES = (
    ".mangadex.network",
    ".mangadex.org",
    ".mangalivre.to",
    ".mangalivre.blog",
    # Os sites Madara servem parte das paginas por uma CDN em subdominio
    # (ex.: cdn.montetaiscanlator.xyz), entao o sufixo tem que entrar junto.
    ".kamisama.com.br",
    ".montetaiscanlator.xyz",
    ".ninjacomics.xyz",
    ".euphoriascan.com",
    ".fbsquadx.com",
    ".ghostscan.xyz",
    ".inkapk.net",
    ".hanamiheaven.org",
)

# Sites Madara checam Referer nas imagens de capitulo; sem ele vem 403.
REFERERS = {
    "mangalivre.to": "https://mangalivre.to/",
    "mangalivre.blog": "https://mangalivre.blog/",
    "kamisama.com.br": "https://leitor.kamisama.com.br/",
    "montetaiscanlator.xyz": "https://montetaiscanlator.xyz/",
    "ninjacomics.xyz": "https://ninjacomics.xyz/",
    "euphoriascan.com": "https://euphoriascan.com/",
    "fbsquadx.com": "https://fbsquadx.com/",
    "ghostscan.xyz": "https://ghostscan.xyz/",
    "inkapk.net": "https://inkapk.net/",
    "hanamiheaven.org": "https://hanamiheaven.org/",
}

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

MAX_IMAGE_BYTES = 20 * 1024 * 1024

# Redirect e comum nas CDNs das fontes, mas cada salto precisa cair de novo em
# `is_allowed`. Um teto baixo evita cadeia infinita.
MAX_REDIRECTS = 5

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


async def fetch_image(
    url: str,
    client: httpx.AsyncClient,
    timeout: httpx.Timeout | None = None,
) -> tuple[bytes, str]:
    """Baixa uma imagem da fonte e devolve (bytes, content_type).

    Segue redirects manualmente porque `follow_redirects=True` validaria
    apenas a URL inicial: um 302 de um host permitido para `169.254.169.254`
    transformaria o proxy num leitor de metadados da VM.

    O corpo e lido em pedacos e cortado em `MAX_IMAGE_BYTES` antes de caber na
    memoria — bufferizar primeiro para medir depois derruba o processo.
    """
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        if not is_allowed(current):
            raise ImageProxyError(f"Host nao permitido: {current}")

        build_kwargs = {} if timeout is None else {"timeout": timeout}
        request = client.build_request(
            "GET", current, headers=upstream_headers(current), **build_kwargs
        )
        response = await client.send(request, stream=True)
        try:
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise ImageProxyError("Redirect sem destino")
                # urljoin resolve Location relativo contra a URL corrente.
                current = urljoin(current, location)
                continue

            response.raise_for_status()

            content_type = response.headers.get("content-type", "image/jpeg")
            if not content_type.startswith("image/"):
                raise ImageProxyError(f"Resposta nao e uma imagem: {content_type}")

            declared = response.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > MAX_IMAGE_BYTES:
                raise ImageProxyError("Imagem excede o tamanho maximo permitido")

            buffer = bytearray()
            async for chunk in response.aiter_bytes():
                buffer.extend(chunk)
                if len(buffer) > MAX_IMAGE_BYTES:
                    raise ImageProxyError("Imagem excede o tamanho maximo permitido")

            return bytes(buffer), content_type
        finally:
            await response.aclose()

    raise ImageProxyError("Redirects demais")
