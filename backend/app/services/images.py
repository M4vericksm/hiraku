"""Proxy de imagens das fontes.

Fontes como o MangaLivre servem as imagens sem cabecalho CORS. Isso funciona
em uma tag <img>, mas o navegador bloqueia `fetch()` — que e exatamente como o
download offline le os bytes da pagina. O proxy resolve isso servindo a imagem
a partir do nosso proprio dominio, com o Referer que a fonte espera.
"""

import asyncio
import ipaddress
import socket
from urllib.parse import quote, urljoin, urlparse

import httpx

ALLOWED_HOSTS = {
    "uploads.mangadex.org",
    "mangalivre.to",
    "www.mangalivre.to",
    "mangalivre.blog",
    "www.mangalivre.blog",
    "montetaiscanlator.xyz",
    "euphoriascan.com",
    "arthurscan.xyz",
    "squadxfbs.com",
    "inkapk.net",
    # CDN de capas e paginas do mangalivre.blog (dominio IDN em punycode).
    "livre.xn--c5wx58dnej.online",
    # Capas e paginas da Drope Scan (sem CORS, passam pelo proxy).
    "bucket-1.dropescan.com",
    # Imagens das scans no Blogger. Passam pelo proxy porque o CORS do Google
    # e inconsistente: parte das imagens vem com `Access-Control-Allow-Origin`
    # e parte nao, e sem ele o download offline (fetch) falha.
    "blogger.googleusercontent.com",
}

ALLOWED_HOST_SUFFIXES = (
    ".mangadex.network",
    ".mangadex.org",
    ".mangalivre.to",
    ".mangalivre.blog",
    ".xn--c5wx58dnej.online",
    ".bp.blogspot.com",
    # Os sites Madara servem parte das paginas por uma CDN em subdominio
    # (ex.: cdn.montetaiscanlator.xyz), entao o sufixo tem que entrar junto.
    ".montetaiscanlator.xyz",
    ".euphoriascan.com",
    ".arthurscan.xyz",
    ".squadxfbs.com",
    ".inkapk.net",
)

# Sites Madara checam Referer nas imagens de capitulo; sem ele vem 403.
REFERERS = {
    "mangalivre.to": "https://mangalivre.to/",
    "mangalivre.blog": "https://mangalivre.blog/",
    "xn--c5wx58dnej.online": "https://mangalivre.blog/",
    "dropescan.com": "https://beta.dropescan.com/",
    "montetaiscanlator.xyz": "https://montetaiscanlator.xyz/",
    "euphoriascan.com": "https://euphoriascan.com/",
    "arthurscan.xyz": "https://arthurscan.xyz/",
    "squadxfbs.com": "https://squadxfbs.com/",
    "inkapk.net": "https://inkapk.net/",
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
#
# As capas (uploads.mangadex.org) seguem diretas, mas hoje o MangaDex responde
# com desafio anti-bot ("Bot challenge not passed") a pedidos vindos de outro
# site, e o card cai na capa tipografica. Pelo proxy tambem nao da: o IP do
# servidor recebe o mesmo desafio (/edge/challenge). Nao contornamos isso.
CORS_SAFE_HOST_SUFFIXES = (
    "uploads.mangadex.org",
    ".mangadex.network",
    # MangaFlix serve capas e paginas com `Access-Control-Allow-Origin: *`.
    ".mangaflix.net",
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


# Tipos genericos que algumas CDNs usam para imagem. So nesses casos (ou sem
# content-type) o proxy confere a assinatura; HTML ou JSON sao recusados direto.
_SNIFFABLE_TYPES = ("application/octet-stream", "binary/octet-stream")


def sniff_image_type(head: bytes) -> str | None:
    """Reconhece o formato pela assinatura (magic bytes) dos primeiros bytes."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if head[4:12] in (b"ftypavif", b"ftypavis"):
        return "image/avif"
    return None


# SVG e XML com script: servido no nosso dominio, viraria XSS. Pagina de
# manga nunca e SVG.
_BLOCKED_IMAGE_TYPES = ("image/svg", "image/svg+xml")


async def resolve_ips(host: str) -> list[str]:
    """IPs para onde o host aponta (separado para os testes substituirem)."""
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


async def ensure_public_host(host: str) -> None:
    """Recusa host que resolve para rede interna, loopback, link-local etc.

    A allowlist confere o nome, mas um dominio de scan pode passar a apontar
    para 127.0.0.1 ou para a rede do Docker (onde esta o Amparo). Sem esta
    checagem o proxy iria ate la.
    """
    try:
        addresses = await resolve_ips(host)
    except OSError as exc:
        raise ImageProxyError(f"Host nao resolve: {host}") from exc
    if not addresses:
        raise ImageProxyError(f"Host nao resolve: {host}")
    for address in addresses:
        if not ipaddress.ip_address(address.split("%", 1)[0]).is_global:
            raise ImageProxyError(f"Host aponta para rede interna: {host}")


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
        await ensure_public_host(urlparse(current).hostname or "")

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

            declared_type = response.headers.get("content-type", "")
            if declared_type.lower().startswith(_BLOCKED_IMAGE_TYPES):
                raise ImageProxyError("SVG nao e aceito pelo proxy")
            content_type = declared_type if declared_type.startswith("image/") else None
            if content_type is None and declared_type and not declared_type.startswith(
                _SNIFFABLE_TYPES
            ):
                raise ImageProxyError(f"Resposta nao e uma imagem: {declared_type}")

            declared = response.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > MAX_IMAGE_BYTES:
                raise ImageProxyError("Imagem excede o tamanho maximo permitido")

            buffer = bytearray()
            async for chunk in response.aiter_bytes():
                buffer.extend(chunk)
                if len(buffer) > MAX_IMAGE_BYTES:
                    raise ImageProxyError("Imagem excede o tamanho maximo permitido")

            if content_type is None:
                # CDNs como a da Monte Tai servem .webp como octet-stream. Em vez
                # de recusar, olhamos a assinatura do arquivo; se nao for imagem
                # conhecida, a resposta continua recusada.
                content_type = sniff_image_type(bytes(buffer[:16]))
                if content_type is None:
                    raise ImageProxyError(f"Resposta nao e uma imagem: {declared_type}")

            return bytes(buffer), content_type
        finally:
            await response.aclose()

    raise ImageProxyError("Redirects demais")
