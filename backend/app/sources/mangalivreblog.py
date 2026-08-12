"""MangaLivre Blog — WordPress, mas nao Madara.

O dominio roda WordPress com tema proprio ("wp-content/themes/tema") e o
plugin slimeread, entao nada do `madara.py` casa aqui: a busca
`?s=&post_type=wp-manga` volta sem `c-tabs-item__content`, nao existe
`ajax/chapters/` e as paginas do capitulo nao usam `wp-manga-chapter-img`.
Era exatamente por isso que registrar o site como Madara devolvia busca
vazia.

O que o site oferece e melhor que scraping de busca: a REST nativa do
WordPress expoe os custom post types `manga` e `chapter` em
`/wp-json/wp/v2/`, com titulo e capa (`_embed`) ja em JSON. Usamos a REST
para buscar e o HTML so onde a REST nao ajuda:

- `chapter` na REST ignora `parent`/`manga` (devolve o catalogo inteiro,
  60k+ itens), entao a lista de capitulos sai do HTML da obra, que ja traz
  todos os `li.chapter-item` renderizados — sem AJAX.
- `content.rendered` do capitulo vem vazio; as imagens estao no HTML sob
  `div.chapter-images` como `img.chapter-image`.

O capitulo mora em `/capitulo/<slug>/`, fora do path da obra, e o slug ja e
unico no site. Ainda assim o `source_id` carrega os dois lados separados por
`ID_SEPARATOR`, no mesmo formato das fontes Madara, para o resto do backend
(e os favoritos ja salvos) nao precisar saber a diferenca.
"""

import html
import re

from app.core.http import get_client
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.sources.genres import normalize_genres
from app.sources.madara import BROWSER_HEADERS, ID_SEPARATOR
from app.sources.normalization import chapter_sort_key, parse_chapter_number, title_score

BASE_URL = "https://mangalivre.blog"

# A REST pagina por `per_page`; 50 e o teto que o WordPress aceita sem
# `edit` context e ja cobre qualquer busca razoavel.
MAX_PER_PAGE = 50


class MangaLivreBlogSource:
    def __init__(self) -> None:
        self._id = "mangalivreblog"
        self._name = "MangaLivre Blog"
        self._base_url = BASE_URL

    @property
    def info(self) -> SourceInfo:
        return SourceInfo(
            id=self._id,
            name=self._name,
            supports_search=True,
            supports_pages=True,
            risk="high",
        )

    def _manga_url(self, manga_source_id: str) -> str:
        return f"{self._base_url}/manga/{manga_source_id}/"

    def _chapter_url(self, chapter_slug: str) -> str:
        return f"{self._base_url}/capitulo/{chapter_slug}/"

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        response = await get_client().get(
            f"{self._base_url}/wp-json/wp/v2/manga",
            params={
                "search": query,
                "per_page": min(limit, MAX_PER_PAGE),
                "_embed": "wp:featuredmedia",
            },
            headers=BROWSER_HEADERS,
        )
        if response.status_code != 200:
            return []

        results: list[MangaSearchResult] = []
        for item in _as_list(response.json()):
            slug = item.get("slug")
            if not slug:
                continue
            title = _clean(_rendered(item.get("title")))
            if not title:
                continue
            results.append(
                MangaSearchResult(
                    source=self.info.id,
                    source_id=slug,
                    title=title,
                    cover_url=_embedded_cover(item),
                    score=title_score(query, [title]),
                )
            )

        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        response = await get_client().get(
            self._manga_url(manga_source_id), headers=BROWSER_HEADERS
        )
        response.raise_for_status()
        text = response.text

        title = _first_match(
            text,
            (
                r'<h1[^>]*class="[^"]*manga-title[^"]*"[^>]*>\s*(.*?)\s*</h1>',
                r"<h1[^>]*>\s*(.*?)\s*</h1>",
                r"<title>\s*(.*?)\s*</title>",
            ),
        )

        return MangaSearchResult(
            source=self.info.id,
            source_id=manga_source_id,
            title=_clean(title) if title else manga_source_id,
            cover_url=_first_match(
                text,
                (
                    r'class="manga-cover"[^>]*>.*?<img[^>]+src="\s*(https?://[^"]+?)\s*"',
                    r'<meta property="og:image" content="\s*(https?://[^"]+?)\s*"',
                ),
            ),
            description=_description(text),
            genres=normalize_genres(_genres(text)),
            score=1.0,
        )

    async def chapters(self, manga_source_id: str, language: str = "pt-br") -> list[Chapter]:
        # Fonte monolingue em PT-BR; `language` existe so para casar a assinatura.
        response = await get_client().get(
            self._manga_url(manga_source_id), headers=BROWSER_HEADERS
        )
        response.raise_for_status()

        chapters: list[Chapter] = []
        seen: set[str] = set()

        for chapter_slug, raw_label in _chapter_links(response.text):
            if chapter_slug in seen:
                continue
            seen.add(chapter_slug)

            label = _clean(raw_label) or chapter_slug
            number = _number_from_label(label)
            chapters.append(
                Chapter(
                    source=self.info.id,
                    source_id=f"{manga_source_id}{ID_SEPARATOR}{chapter_slug}",
                    manga_source_id=manga_source_id,
                    title=label,
                    chapter=number,
                    language="pt-br",
                    normalized_number=parse_chapter_number(number, label),
                    sort_key=chapter_sort_key(number, label),
                )
            )

        return sorted(chapters, key=lambda item: item.sort_key)

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        _, _, chapter_slug = chapter_source_id.partition(ID_SEPARATOR)
        if not chapter_slug:
            # Sem separador nao da para montar a URL do capitulo.
            return ChapterPages(
                source=self.info.id,
                source_chapter_id=chapter_source_id,
                page_urls=[],
                data_saver=data_saver,
            )

        response = await get_client().get(
            self._chapter_url(chapter_slug), headers=BROWSER_HEADERS
        )
        response.raise_for_status()

        return ChapterPages(
            source=self.info.id,
            source_chapter_id=chapter_source_id,
            page_urls=_page_urls(response.text),
            data_saver=data_saver,
        )


def _as_list(payload: object) -> list[dict]:
    """A REST devolve lista; erro (`{"code": ...}`) vem como objeto."""
    return payload if isinstance(payload, list) else []


def _rendered(field: object) -> str:
    """Campos de texto da REST vem como {"rendered": "..."}."""
    if isinstance(field, dict):
        value = field.get("rendered")
        return value if isinstance(value, str) else ""
    return field if isinstance(field, str) else ""


def _embedded_cover(item: dict) -> str | None:
    embedded = item.get("_embedded")
    if not isinstance(embedded, dict):
        return None
    media = embedded.get("wp:featuredmedia")
    if not isinstance(media, list) or not media:
        return None
    first = media[0]
    url = first.get("source_url") if isinstance(first, dict) else None
    return url if isinstance(url, str) and url.startswith("http") else None


# A lista da obra vem inteira no HTML: <a href=".../capitulo/<slug>/"
# class="chapter-link"><span class="chapter-number">Capitulo N</span>.
_CHAPTER_LINK_PATTERN = re.compile(
    r'<a\s+href="(?:' + re.escape(BASE_URL) + r')?/capitulo/([^/"?#]+)/?"'
    r'[^>]*class="[^"]*chapter-link[^"]*"[^>]*>\s*(.*?)\s*</a>',
    re.DOTALL,
)


def _chapter_links(text: str) -> list[tuple[str, str]]:
    """Devolve (slug, rotulo) de cada capitulo listado na pagina da obra.

    O botao "Iniciar Leitura" aponta para o ultimo capitulo com a mesma URL,
    mas usa `class="start-reading-btn"`; exigir `chapter-link` no `<a>` ja o
    descarta, entao a lista nao ganha um duplicado com rotulo errado.
    """
    return _CHAPTER_LINK_PATTERN.findall(text)


def _number_from_label(label: str) -> str:
    """Extrai "1190" de "Capitulo 1190"; sem numero, devolve o rotulo."""
    match = re.search(r"(\d+(?:[.,]\d+)?)", label)
    return match.group(1).replace(",", ".") if match else label


# As paginas ficam em <div class="chapter-images"> como <img class="chapter-image">.
# Casar a classe evita pegar capa, avatar e icone que existem na mesma pagina.
_PAGE_IMG_PATTERN = re.compile(r"<img([^>]+)>")


def _page_urls(text: str) -> list[str]:
    urls: list[str] = []
    for match in _PAGE_IMG_PATTERN.finditer(text):
        attrs = match.group(1)
        if "chapter-image" not in attrs:
            continue
        url = _img_src(attrs)
        if url:
            urls.append(url)
    return urls


def _img_src(attrs: str) -> str | None:
    """Le a URL real do <img>, com `data-src` na frente por causa do lazyload."""
    for attr in ("data-src", "data-lazy-src", "src"):
        match = re.search(rf'\s{re.escape(attr)}=["\']\s*([^"\']+?)\s*["\']', attrs)
        if match:
            url = match.group(1).strip()
            if url.startswith("http"):
                return url
    return None


def _first_match(text: str, patterns: tuple[str, ...]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            value = match.group(1).strip()
            if value:
                return value
    return None


def _description(text: str) -> str | None:
    """Le a sinopse de `div.synopsis-content`.

    Mirar em `manga-synopsis` (o container externo) traria junto o `<h3>
    Sinopse</h3>` que o tema renderiza como cabecalho, e a descricao apareceria
    comecando com a palavra "Sinopse".
    """
    raw = _first_match(
        text,
        (
            r'class="synopsis-content"[^>]*>\s*(.*?)\s*</div>',
            r'<meta name="description" content="([^"]+)"',
        ),
    )
    return _clean(raw) if raw else None


def _genres(text: str) -> list[str]:
    """Le os generos de `span.manga-tag`.

    O tema nao linka genero (nao existe /genero/ no site), so imprime o nome
    em span — por isso nada de casar `<a href>` como nas fontes Madara.
    """
    found = re.findall(r'<span class="manga-tag">\s*(.*?)\s*</span>', text, re.DOTALL)
    genres: list[str] = []
    for raw in found:
        name = _clean(raw)
        if name and name not in genres:
            genres.append(name)
    return genres[:12]


def _clean(raw: str | None) -> str:
    """Tira as tags e normaliza o espaco em branco.

    A sinopse vem em varios `<p>` indentados; sem colapsar o espaco, o texto
    chega ao frontend com quebras de linha e recuo do HTML no meio da frase.
    """
    if not raw:
        return ""
    without_tags = re.sub(r"<[^>]*>", " ", raw)
    return re.sub(r"\s+", " ", html.unescape(without_tags)).strip()
