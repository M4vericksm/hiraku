from app.sources.base import SourceAdapter
from app.sources.madara import MadaraSource
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


# Sites Madara em PT-BR. Todos verificados respondendo com markup do tema
# (`wp-content/themes/madara`, blocos `c-tabs-item__content`) e com a listagem
# de capitulos vindo pelo AJAX do tema. Sao scans pequenas: domino e markup
# mudam sem aviso, por isso `risk="high"`.
PTBR_MADARA_SOURCES = (
    ("kamisama", "Kami Sama Explorer", "https://leitor.kamisama.com.br"),
    ("montetai", "Monte Tai", "https://montetaiscanlator.xyz"),
    ("ninjascan", "Ninja Scan", "https://ninjacomics.xyz"),
    ("toonlivre", "ToonLivre", "https://toonlivre.com"),
)


def default_registry() -> SourceRegistry:
    registry = SourceRegistry()
    registry.register(MangaDexSource())
    registry.register(MangaLivreSource())
    for source_id, name, base_url in PTBR_MADARA_SOURCES:
        registry.register(MadaraSource(source_id=source_id, name=name, base_url=base_url))
    return registry
