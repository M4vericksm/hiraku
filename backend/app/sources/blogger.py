"""Adapter das scans hospedadas no Blogger (tema ZeistManga e parecidos).

Tudo sai do feed JSON publico do Blogger, sem raspar o template de cada blog:

- busca:     GET /feeds/posts/default?alt=json&q=...
- obra:      GET /feeds/posts/default/{post_id}?alt=json
- capitulos: GET /feeds/posts/default/-/{rotulo_de_capitulo}/{rotulo_da_serie}
- paginas:   GET /feeds/posts/default/{post_id}?alt=json  (imagens do post)

O que muda de blog para blog:
- o rotulo que marca capitulo ("Chapter" ou "Capítulo");
- o rotulo que marca serie ("Projeto", "Project"...), quando o blog usa um;
- como a serie aponta para os capitulos: `data-labelchapter="..."` ou
  `clwd.run('...')` no post, ou simplesmente um rotulo com o nome da serie.

As paginas aparecem como `<img src>` ou numa lista em script
(`wz_pages_chapter=[...]`); por isso a extracao pega, em ordem, toda URL de
imagem do Blogger no conteudo. As imagens do Blogger vem com
`Access-Control-Allow-Origin: *` e vao direto para o navegador.
"""

import html
import re
from dataclasses import dataclass
from urllib.parse import quote

from app.core.http import get_client
from app.sources.base import SourceNotFoundError
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.sources.genres import normalize_genres
from app.sources.normalization import chapter_sort_key, parse_chapter_number, title_score

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}
FEED_PAGE_SIZE = 150
MAX_CHAPTER_PAGES = 20

# Rotulos que nunca sao serie nem nome de serie.
_NOT_SERIES_LABELS = {
    "news",
    "noticias",
    "notícias",
    "anime",
    "novel",
    "novela",
    "recentes",
    "series",
    "project",
    "projeto",
    "todos os projetos",
    "ativo",
    "completo",
    "concluido",
    "concluído",
    "dropado",
    "hiato",
    "mangá",
    "manga",
    "manhwa",
    "manhua",
    "webtoon",
    "one-shot",
    "long strip",
}

_CHAPTER_FEED_PATTERNS = (
    re.compile(r'data-labelchapter="([^"]+)"'),
    re.compile(r"clwd\.run\(\s*['\"](.*?)['\"]\s*\)"),
)

# URL de imagem hospedada no Blogger, em <img src> ou dentro de string de script.
_BLOGGER_IMAGE = re.compile(
    r"https://(?:blogger\.googleusercontent\.com/img/|\d+\.bp\.blogspot\.com/)[^\"'\s<>)\\]+"
)


@dataclass(frozen=True)
class BloggerSite:
    id: str
    name: str
    base_url: str
    chapter_label: str = "Chapter"
    # Rotulo que marca post de serie. Sem ele, serie e todo post que nao e
    # capitulo nem noticia.
    series_label: str | None = None


class BloggerSource:
    def __init__(self, site: BloggerSite) -> None:
        self._site = site

    @property
    def info(self) -> SourceInfo:
        return SourceInfo(id=self._site.id, name=self._site.name, risk="high")

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        path = f"/-/{quote(self._site.series_label)}" if self._site.series_label else ""
        feed = await self._feed(path, {"q": query, "max-results": 50})
        results: list[MangaSearchResult] = []
        for entry in feed.get("entry") or []:
            if not self._is_series(entry):
                continue
            result = self._map_entry(entry)
            result.score = title_score(query, [result.title])
            results.append(result)
        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        entry = await self._entry(manga_source_id)
        result = self._map_entry(entry)
        result.description = _description(_content(entry))
        result.genres = normalize_genres(_labels(entry))
        result.score = 1.0
        return result

    async def chapters(self, manga_source_id: str, language: str = "pt-br") -> list[Chapter]:
        entry = await self._entry(manga_source_id)
        for label in await self._series_label_candidates(entry):
            entries = await self._chapter_entries(label)
            if entries:
                return self._map_chapters(manga_source_id, entries)
        return []

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        entry = await self._entry(chapter_source_id)
        return ChapterPages(
            source=self.info.id,
            source_chapter_id=chapter_source_id,
            page_urls=extract_page_urls(_content(entry)),
            data_saver=False,
        )

    def _is_series(self, entry: dict) -> bool:
        labels = {label.lower() for label in _labels(entry)}
        if self._site.chapter_label.lower() in labels:
            return False
        if self._site.series_label:
            return self._site.series_label.lower() in labels
        return not labels & {"news", "noticias", "notícias", "anime", "novel", "novela"}

    def _map_entry(self, entry: dict) -> MangaSearchResult:
        return MangaSearchResult(
            source=self.info.id,
            source_id=_post_id(entry),
            title=html.unescape(entry.get("title", {}).get("$t", "")).strip() or "Sem título",
            cover_url=_cover(entry),
            language="pt-br",
        )

    async def _series_label_candidates(self, entry: dict) -> list[str]:
        """Rotulos que podem agrupar os capitulos da serie, do mais confiavel ao menos."""
        candidates: list[str] = []
        content = _content(entry)
        found = _chapter_feed_label(content)
        if not found:
            page = await self._page_html(entry)
            found = _chapter_feed_label(page) if page else None
        if found:
            candidates.append(found)

        title = html.unescape(entry.get("title", {}).get("$t", "")).strip()
        own = [
            label
            for label in _labels(entry)
            if label.lower() not in _NOT_SERIES_LABELS
            and label.lower() != self._site.chapter_label.lower()
            # Genero (Isekai, Acao...) juntaria capitulos de varias obras.
            and not normalize_genres([label])
            and not re.match(r"^(score\b|\d)", label.lower())
            and label.lower() not in {"adulto", "+18", "18+"}
        ]
        # O rotulo igual ao titulo vem primeiro; generos (Acao, Drama...) por ultimo.
        own.sort(key=lambda label: label.lower() != title.lower())
        candidates.extend(own)
        if title:
            candidates.append(title)

        seen: set[str] = set()
        return [c for c in candidates if not (c in seen or seen.add(c))]

    async def _chapter_entries(self, series_label: str) -> list[dict]:
        path = f"/-/{quote(self._site.chapter_label)}/{quote(series_label, safe='')}"
        entries: list[dict] = []
        for _ in range(MAX_CHAPTER_PAGES):
            feed = await self._feed(
                path, {"start-index": len(entries) + 1, "max-results": FEED_PAGE_SIZE}
            )
            batch = feed.get("entry") or []
            entries.extend(batch)
            total = int((feed.get("openSearch$totalResults") or {}).get("$t") or 0)
            if not batch or len(entries) >= total:
                break
        chapter_label = self._site.chapter_label.lower()
        return [e for e in entries if chapter_label in {lab.lower() for lab in _labels(e)}]

    def _map_chapters(self, manga_source_id: str, entries: list[dict]) -> list[Chapter]:
        chapters: list[Chapter] = []
        seen: set[str] = set()
        for entry in entries:
            chapter_id = _post_id(entry)
            if chapter_id in seen:
                continue
            seen.add(chapter_id)
            title = html.unescape(entry.get("title", {}).get("$t", "")).strip() or None
            number = _chapter_number(title)
            chapters.append(
                Chapter(
                    source=self.info.id,
                    source_id=chapter_id,
                    manga_source_id=manga_source_id,
                    title=title,
                    chapter=number,
                    language="pt-br",
                    normalized_number=parse_chapter_number(number, title),
                    sort_key=chapter_sort_key(number, title),
                )
            )
        return sorted(chapters, key=lambda item: item.sort_key)

    async def _entry(self, post_id: str) -> dict:
        if not post_id.isdigit():
            raise SourceNotFoundError(f"Id de post invalido: {post_id}")
        response = await get_client().get(
            f"{self._site.base_url}/feeds/posts/default/{post_id}",
            params={"alt": "json"},
            headers=HEADERS,
        )
        response.raise_for_status()
        return response.json().get("entry") or {}

    async def _feed(self, path: str, params: dict) -> dict:
        response = await get_client().get(
            f"{self._site.base_url}/feeds/posts/default{path}",
            params={"alt": "json", **params},
            headers=HEADERS,
        )
        response.raise_for_status()
        return response.json().get("feed") or {}

    async def _page_html(self, entry: dict) -> str | None:
        link = next(
            (item.get("href") for item in entry.get("link") or [] if item.get("rel") == "alternate"),
            None,
        )
        if not link or not link.startswith(self._site.base_url):
            return None
        try:
            response = await get_client().get(link, headers=HEADERS)
        except Exception:
            return None
        return response.text if response.status_code == 200 else None


def extract_page_urls(content: str) -> list[str]:
    """URLs de imagem do Blogger no post, em ordem e sem repetir."""
    seen: set[str] = set()
    urls: list[str] = []
    for url in _BLOGGER_IMAGE.findall(html.unescape(content)):
        # Miniatura (s72-c) e icone nao sao pagina.
        if re.search(r"/s\d{2}(?:-c)?/", url) or url in seen:
            continue
        seen.add(url)
        urls.append(url)
    return urls


def _chapter_feed_label(text: str) -> str | None:
    for pattern in _CHAPTER_FEED_PATTERNS:
        match = pattern.search(text)
        if match and match.group(1).strip():
            return html.unescape(match.group(1).strip())
    return None


def _labels(entry: dict) -> list[str]:
    return [c["term"] for c in entry.get("category") or [] if c.get("term")]


def _post_id(entry: dict) -> str:
    return str(entry.get("id", {}).get("$t", "")).rsplit("post-", 1)[-1]


def _content(entry: dict) -> str:
    return (entry.get("content") or entry.get("summary") or {}).get("$t", "")


def _cover(entry: dict) -> str | None:
    thumb = (entry.get("media$thumbnail") or {}).get("url")
    if thumb:
        # O feed entrega a miniatura 72px; o mesmo arquivo serve em 400px.
        # Dois formatos de URL: .../s72-c/arquivo.jpg e ...=s72-c no fim.
        thumb = re.sub(r"/s\d+(?:-c)?/", "/s400/", thumb)
        return re.sub(r"=s\d+(?:-c)?$", "=s400", thumb)
    pages = extract_page_urls(_content(entry))
    return pages[0] if pages else None


def _description(content: str) -> str | None:
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", content, flags=re.DOTALL)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:800] or None


def _chapter_number(title: str | None) -> str | None:
    if not title:
        return None
    match = re.search(r"(?:cap[ií]tulo|chapter|cap\.?|ch\.?)\s*(\d+(?:[.,]\d+)?)", title, re.I)
    if not match:
        match = re.search(r"(\d+(?:[.,]\d+)?)\s*$", title)
    return match.group(1).replace(",", ".") if match else None


# Blogs verificados em 24/11/2026: leitura aberta, sem login, imagens no Blogger.
# Ficaram de fora: Galax Scanlator (parte dos capitulos e PDF do Google Drive),
# Duo Scanlators (nao tem post de serie, so capitulos) e Leitor Reverse (9 posts).
BLOGGER_SITES = (
    BloggerSite("pinkrosa", "Pink Rosa Scan", "https://scanpinkrosa.blogspot.com"),
    BloggerSite("apenasumafa", "Apenas Uma Fã", "https://apenasuma-fa.blogspot.com"),
    BloggerSite("ler999", "Ler 999", "https://ler999.blogspot.com"),
    BloggerSite(
        "hanmokku",
        "Hanmokku Scan",
        "https://hanmokkuscan.blogspot.com",
        chapter_label="Capítulo",
        series_label="Todos os Projetos",
    ),
    BloggerSite(
        "traducoesdolipe",
        "Traduções do Lipe",
        "https://traducoesdolipe.blogspot.com",
        chapter_label="Capítulo",
        series_label="Projeto",
    ),
)
