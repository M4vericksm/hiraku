"""MangaLivre — um site Madara como qualquer outro.

Todo o scraping vive em `sources/madara.py`; aqui so ficam o dominio e o
nome. O formato de `source_id` de capitulo ("{manga}___{capitulo-slug}") e o
mesmo de antes, entao favoritos e historico ja salvos continuam validos.
"""

from app.sources.madara import BROWSER_HEADERS, MadaraSource

__all__ = ["MangaLivreSource", "BROWSER_HEADERS"]


class MangaLivreSource(MadaraSource):
    def __init__(self) -> None:
        super().__init__(
            source_id="mangalivre",
            name="MangaLivre",
            base_url="https://mangalivre.to",
        )
