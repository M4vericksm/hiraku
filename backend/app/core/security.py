"""Protecoes de borda da API: limite de requisicoes por IP e cabecalhos.

A API e publica e cada busca agregada dispara dezenas de pedidos as fontes;
sem limite, qualquer um conseguia gastar a banda e a CPU da VM (que tambem
roda o Amparo) ou martelar as scans a partir do nosso IP.

Os limites sao folgados de proposito: baixar um capitulo de 60 paginas com
retentativas fica muito abaixo do teto do `/image`, e uma pessoa digitando
buscas nao chega perto do teto da busca.

O IP vem de `CF-Connecting-IP`: o container nao publica porta, entao todo
trafego chega pelo cloudflared, e a Cloudflare sobrescreve esse cabecalho
(o cliente nao consegue falsificar). Sem ele (desenvolvimento local), vale o
IP da conexao.
"""

import ipaddress
import time
from collections import deque
from dataclasses import dataclass

from starlette.types import ASGIApp, Message, Receive, Scope, Send

WINDOW_SECONDS = 60
MAX_TRACKED_KEYS = 50_000


@dataclass(frozen=True)
class Limit:
    bucket: str
    per_minute: int


IMAGE_LIMIT = Limit("image", 1200)
SEARCH_LIMIT = Limit("search", 90)
DEFAULT_LIMIT = Limit("default", 600)

# Cada pedido ao /image pode trazer ate 20 MB; contar so pedidos deixava um IP
# puxar gigas por minuto. 600 MB/min cobre varios capitulos baixando juntos.
IMAGE_BYTES_PER_MINUTE = 600 * 1024 * 1024

# Rotas sem limite: healthcheck do Docker e da Cloudflare.
EXEMPT_PATHS = {"/health"}

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
]

# Imagem servida no nosso dominio nao pode rodar nada, nem se a fonte mandar
# algo que nao e imagem: sem script, sem navegacao, sem recurso externo.
IMAGE_HEADERS = [
    (b"content-security-policy", b"default-src 'none'; sandbox"),
    (b"cross-origin-resource-policy", b"cross-origin"),
]


def limit_for(path: str) -> Limit | None:
    if path in EXEMPT_PATHS:
        return None
    if path == "/image":
        return IMAGE_LIMIT
    if path == "/manga/search":
        return SEARCH_LIMIT
    return DEFAULT_LIMIT


def client_ip(scope: Scope) -> str:
    for name, value in scope.get("headers") or []:
        if name == b"cf-connecting-ip":
            return value.decode("latin-1").strip()
    client = scope.get("client")
    return client[0] if client else "desconhecido"


def client_key(scope: Scope) -> str:
    """Chave do limite: o IP, ou o bloco /64 quando e IPv6.

    Uma conexao IPv6 domestica recebe um /64 inteiro; contar por endereco
    deixaria trocar de IP a cada pedido e passar por cima do limite.
    """
    ip = client_ip(scope)
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if address.version == 6:
        return str(ipaddress.ip_network(f"{address}/64", strict=False))
    return ip


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = {}

    def hit(self, key: tuple[str, str], per_minute: int, now: float | None = None) -> float:
        """Registra um pedido; devolve 0 se pode seguir, ou segundos de espera."""
        now = time.monotonic() if now is None else now
        window = self._hits.get(key)
        if window is None:
            if len(self._hits) >= MAX_TRACKED_KEYS:
                self._evict(now)
            window = self._hits[key] = deque()
        while window and now - window[0] >= WINDOW_SECONDS:
            window.popleft()
        if len(window) >= per_minute:
            return max(1.0, WINDOW_SECONDS - (now - window[0]))
        window.append(now)
        return 0.0

    def _evict(self, now: float) -> None:
        stale = [k for k, w in self._hits.items() if not w or now - w[-1] >= WINDOW_SECONDS]
        for key in stale:
            del self._hits[key]
        if len(self._hits) >= MAX_TRACKED_KEYS:
            # Ainda cheio (ataque com muitos IPs): solta metade para nao crescer sem fim.
            for key in list(self._hits)[: len(self._hits) // 2]:
                del self._hits[key]


class ByteBudget:
    """Bytes servidos por chave na ultima janela de 60 s."""

    def __init__(self) -> None:
        self._sent: dict[str, deque[tuple[float, int]]] = {}

    def used(self, key: str, now: float | None = None) -> int:
        now = time.monotonic() if now is None else now
        window = self._sent.get(key)
        if not window:
            return 0
        while window and now - window[0][0] >= WINDOW_SECONDS:
            window.popleft()
        return sum(size for _, size in window)

    def add(self, key: str, size: int, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        if key not in self._sent and len(self._sent) >= MAX_TRACKED_KEYS:
            stale = [k for k, w in self._sent.items() if not w or now - w[-1][0] >= WINDOW_SECONDS]
            for k in stale or list(self._sent)[: len(self._sent) // 2]:
                del self._sent[k]
        self._sent.setdefault(key, deque()).append((now, size))


class EdgeProtectionMiddleware:
    """Aplica o limite por IP e acrescenta os cabecalhos de seguranca."""

    def __init__(self, app: ASGIApp, enabled: bool = True) -> None:
        self.app = app
        self.enabled = enabled
        self.limiter = SlidingWindowLimiter()
        self.image_bytes = ByteBudget()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        limit = limit_for(path) if self.enabled and scope.get("method") != "OPTIONS" else None
        key = client_key(scope)
        if limit is not None:
            wait = self.limiter.hit((key, limit.bucket), limit.per_minute)
            if not wait and limit is IMAGE_LIMIT:
                if self.image_bytes.used(key) >= IMAGE_BYTES_PER_MINUTE:
                    wait = WINDOW_SECONDS / 2
            if wait:
                await _too_many_requests(send, wait)
                return
        count_bytes = limit is IMAGE_LIMIT

        extra = SECURITY_HEADERS + (IMAGE_HEADERS if path == "/image" else [])

        async def send_with_headers(message: Message) -> None:
            if count_bytes and message["type"] == "http.response.body":
                self.image_bytes.add(key, len(message.get("body", b"")))
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                present = {name.lower() for name, _ in headers}
                headers.extend((n, v) for n, v in extra if n not in present)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


async def _too_many_requests(send: Send, wait: float) -> None:
    body = b'{"detail":"Muitas requisicoes; tente de novo em instantes."}'
    await send(
        {
            "type": "http.response.start",
            "status": 429,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"retry-after", str(int(wait) + 1).encode()),
                *SECURITY_HEADERS,
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class PublicImageCorsMiddleware:
    """`/image` responde `Access-Control-Allow-Origin: *`, sem `Vary: Origin`.

    Imagem e publica e nunca usa credencial. Com o CORS padrao a resposta
    levava a origem de quem pediu (site ou app); com cache na Cloudflare, que
    nao separa por origem, a copia guardada para um quebraria o download no
    outro. Fica por fora do CORSMiddleware para ter a ultima palavra.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") != "/image":
            await self.app(scope, receive, send)
            return

        async def send_public(message: Message) -> None:
            if message["type"] == "http.response.start":
                dropped = {b"access-control-allow-origin", b"access-control-allow-credentials"}
                headers = [
                    (name, value)
                    for name, value in message.get("headers") or []
                    if name.lower() not in dropped
                    and not (name.lower() == b"vary" and value.lower() == b"origin")
                ]
                headers.append((b"access-control-allow-origin", b"*"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_public)
