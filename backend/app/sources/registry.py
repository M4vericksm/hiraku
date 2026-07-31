from app.sources.base import SourceAdapter
from app.sources.mangadex import MangaDexSource
from app.sources.mangalivre import MangaLivreSource


class UnknownSourceError(ValueError):
    pass


class SourceRegistry:
    def __init__(self) -> None:
        self._sources: dict[str, SourceAdapter] = {}

    def register(self, adapter: SourceAdapter) -> None:
        self._sources[adapter.info.id] = adapter

    def get(self, source_id: str) -> SourceAdapter:
        adapter = self._sources.get(source_id)
        if not adapter:
            raise UnknownSourceError(f"Fonte desconhecida: {source_id}")
        return adapter

    def all(self) -> list[SourceAdapter]:
        return list(self._sources.values())


def default_registry() -> SourceRegistry:
    registry = SourceRegistry()
    registry.register(MangaDexSource())
    registry.register(MangaLivreSource())
    return registry
