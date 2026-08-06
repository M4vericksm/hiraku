import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    # Origins liberadas no CORS. Inclui:
    # - vite dev (browser)
    # - Capacitor Android (androidScheme http/https)
    # - Capacitor iOS
    cors_origins: list[str] = field(
        default_factory=lambda: _list_env(
            "HIRAKU_CORS_ORIGINS",
            [
                "http://localhost:5173",
                "http://localhost",
                "https://localhost",
                "capacitor://localhost",
                "ionic://localhost",
            ],
        )
    )
    database_url: str = os.getenv("HIRAKU_DATABASE_URL", "sqlite:///./hiraku.db")
    mangadex_base_url: str = os.getenv("HIRAKU_MANGADEX_BASE_URL", "https://api.mangadex.org")
    cache_ttl_seconds: int = int(os.getenv("HIRAKU_CACHE_TTL_SECONDS", "300"))
    default_language: str = os.getenv("HIRAKU_DEFAULT_LANGUAGE", "pt-br")


def _list_env(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


settings = Settings()
