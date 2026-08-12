from app.sources.base import SourceAdapter
from app.sources.madara import MadaraSource
from app.sources.mangadex import MangaDexSource
from app.sources.mangalivre import MangaLivreSource
from app.sources.mangalivreblog import MangaLivreBlogSource


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
# toonlivre.com saiu do ar (o dominio nao resolve mais em DNS). Ficava so
# gastando o timeout de cada busca para sempre devolver lista vazia.
PTBR_MADARA_SOURCES = (
    # id, nome, base_url, manga_paths (opcional; default ("manga",))
    ("kamisama", "Kami Sama Explorer", "https://leitor.kamisama.com.br"),
    ("montetai", "Monte Tai", "https://montetaiscanlator.xyz"),
    ("ninjascan", "Ninja Scan", "https://ninjacomics.xyz"),
    ("euphoriascan", "Euphoria Scan", "https://euphoriascan.com"),
    ("fleurblanche", "Fleur Blanche", "https://fbsquadx.com"),
    ("ghostscan", "Ghost Scan", "https://ghostscan.xyz"),
    ("inkapk", "Inka PK", "https://inkapk.net", ("obras",)),
    ("hanamiheaven", "Hanami Heaven", "https://hanamiheaven.org"),
    # mangalivre.blog nao entra aqui: roda WordPress com tema proprio, nao
    # Madara. Tem adapter dedicado (`MangaLivreBlogSource`), registrado abaixo.
    # mangalivre.org ficou de fora, e nao por catalogo: ele lista ~12k obras
    # (contra 753 do .blog), mas nenhuma abre. O bundle da SPA chama
    # `GET /api/v1/chapters/${id}` e essa rota devolve 404 para todo id — o
    # UUID e o legacyId, na obra recem-atualizada e na mais favoritada, com e
    # sem Origin/Referer do proprio site. A rota de leitor que o bundle monta
    # (`/ler/<slug>/online/<legacyId>/<numero>`) serve so o HTML vazio da SPA
    # (1390 bytes, zero <img>), entao nao ha nem o que raspar. Catalogo que
    # nao entrega pagina nao e conteudo: registrar so encheria a busca de
    # resultados que dao erro ao abrir.
    # mangalivre.net nao e fonte: hoje e uma landing de despedida ("Paz e
    # adeus") apontando para MangaPlus, Comikey, JBC e Toomics. Nao tem
    # catalogo — qualquer path responde a mesma home de 14 KB.
    # toonlivre.net redireciona 302 para www.mangalivre.net (dominio que nao
    # e nosso). Sem conteudo proprio, a busca sempre voltava vazia e so
    # gastava timeout — mesma razao pela qual toonlivre.com ja saiu.
)


def default_registry() -> SourceRegistry:
    registry = SourceRegistry()
    registry.register(MangaDexSource())
    registry.register(MangaLivreSource())
    registry.register(MangaLivreBlogSource())
    for source_def in PTBR_MADARA_SOURCES:
        source_id, name, base_url = source_def[:3]
        # A 4a posicao so aparece em quem nao serve as obras sob /manga/
        # (ex.: inkapk usa /obras/); sem ela vale o default do MadaraSource.
        extra = {"manga_paths": source_def[3]} if len(source_def) > 3 else {}
        registry.register(
            MadaraSource(source_id=source_id, name=name, base_url=base_url, **extra)
        )
    return registry
