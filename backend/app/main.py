from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core import http
from app.core.config import settings
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
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    @app.exception_handler(SourceNotFoundError)
    async def _not_found(_: Request, exc: SourceNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    return app


app = create_app()
