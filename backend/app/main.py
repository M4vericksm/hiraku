from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core import http
from app.core.config import settings
from app.core.security import EdgeProtectionMiddleware, PublicImageCorsMiddleware
from app.db.models import Base
from app.db.session import engine
from app.sources.base import SourceNotFoundError


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await http.startup()
    try:
        yield
    finally:
        await http.shutdown()


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)
    app = FastAPI(
        title="Hiraku API",
        version="0.1.0",
        description="Backend para catalogo, fontes e leitura de mangas.",
        lifespan=lifespan,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    # Ordem importa: o ultimo adicionado e o mais externo. O CORS fica por
    # fora do limite para que o 429 chegue ao navegador com Access-Control-*
    # (sem isso o app veria "erro de rede" em vez de "muitas requisicoes").
    app.add_middleware(EdgeProtectionMiddleware, enabled=settings.rate_limit_enabled)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        # O app nao usa cookie nem auth: credencial cross-origin so abriria porta.
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.add_middleware(PublicImageCorsMiddleware)
    app.include_router(router)

    @app.exception_handler(SourceNotFoundError)
    async def _not_found(_: Request, exc: SourceNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    return app


app = create_app()
