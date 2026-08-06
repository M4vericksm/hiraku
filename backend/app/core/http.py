"""Cliente HTTP compartilhado.

Um `AsyncClient` por processo, criado no startup e fechado no shutdown. Sem
isso cada requisicao abria uma conexao nova: um capitulo de 20 paginas fazia
20 handshakes TLS contra o mesmo host.

`follow_redirects` fica desligado de proposito. O proxy de imagens precisa
revalidar o host a cada salto (ver `services/images.py`), e as fontes tratam
redirect como sinal de que o endpoint mudou.
"""

import httpx

# connect curto (host morto falha rapido), read mais longo (imagem grande).
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=20.0, write=10.0, pool=5.0)
IMAGE_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)

DEFAULT_LIMITS = httpx.Limits(
    max_connections=50,
    max_keepalive_connections=20,
    keepalive_expiry=30.0,
)

_client: httpx.AsyncClient | None = None


def create_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=DEFAULT_TIMEOUT,
        limits=DEFAULT_LIMITS,
        follow_redirects=False,
    )


async def startup() -> None:
    global _client
    if _client is None:
        _client = create_client()


async def shutdown() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def get_client() -> httpx.AsyncClient:
    """Devolve o cliente do processo, criando um sob demanda nos testes.

    Em producao o lifespan sempre chama `startup()` antes. O fallback existe
    para testes que importam os adapters sem subir o app.
    """
    global _client
    if _client is None:
        _client = create_client()
    return _client
