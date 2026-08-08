"""Adapter generico para sites com o tema WordPress "Madara" (WP-Manga).

Dezenas de sites de scan usam o mesmo tema, entao a estrutura de HTML e quase
identica entre eles: busca em `?s=&post_type=wp-manga`, blocos
`row c-tabs-item__content`, `div.post-title`, `div.summary_image`,
`img.wp-manga-chapter-img`. O que muda de site para site e o dominio, o
prefixo do path do manga (/manga/, /ler/, /obra/) e pequenas variacoes de
markup — por isso tudo aqui e parametrizavel e cada extracao tenta uma lista
de padroes ate um casar, em vez de depender de um regex unico.

Nao usamos um parser de HTML de proposito: o resto do backend ja faz scraping
com regex e adicionar uma dependencia so para isso nao se paga.
"""

import html
import re

from app.core.http import get_client
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.sources.genres import normalize_genres
from app.sources.normalization import chapter_sort_key, parse_chapter_number, title_score

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# Cabecalho que o Madara usa para diferenciar o POST de listagem de capitulos
# de um GET normal; sem ele alguns sites devolvem a pagina inteira.
AJAX_HEADERS = {**BROWSER_HEADERS, "X-Requested-With": "XMLHttpRequest"}

# Separador entre slug do manga e slug do capitulo no source_id composto.
# O Madara nao expoe um id numerico estavel para o capitulo, so o slug, e o
# slug sozinho nao basta para remontar a URL — precisamos dos dois.
ID_SEPARATOR = "___"

# Ultimo segmento da URL que nunca e um capitulo. O link do capitulo mora sob
# o mesmo path do manga que estes, entao filtrar por prefixo nao resolve.
_NOT_A_CHAPTER = {"feed", "ajax", "comments", "amp", "embed"}

# Textos dos botoes de atalho que o tema renderiza como link de capitulo. Eles
# apontam para um capitulo real, mas nao sao a listagem — se sobrarem, a pagina
# parece ter capitulos e o fallback AJAX (que traz a lista toda) nunca roda.
_SKIP_CHAPTER_TITLES = (
    "ler último capítulo", "ler primeiro capítulo",
    "ler ultimo capitulo", "ler primeiro capitulo",
    "iniciar leitura", "começar a ler", "comecar a ler",
)

# Prefixos de slug de capitulo, do mais longo para o mais curto — "capitulo-"
# tem que ser testado antes de "cap-" senao sobraria "itulo-06".
_CHAPTER_PREFIXES = ("capitulo-", "capítulo-", "chapter-", "cap-", "ch-")

_TITLE_PATTERNS = (
    r'<div class="post-title[^"]*">\s*<h[1-3][^>]*>\s*(.*?)\s*</h[1-3]>',
    r'<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*(.*?)\s*</h1>',
    r'<meta property="og:title" content="([^"]+)"',
)

# `src` costuma ser um placeholder de lazyload, entao `data-src` vem primeiro.
_COVER_PATTERNS = (
    r'class="summary_image">.*?data-src=["\']\s*(https?://[^"\']+?)\s*["\']',
    r'class="summary_image">.*?\ssrc=["\']\s*(https?://[^"\']+?)\s*["\']',
    r'<meta property="og:image" content="\s*(https?://[^"]+?)\s*"',
)

_DESCRIPTION_PATTERNS = (
    r'<div class="description-summary">.*?<p>\s*(.*?)\s*</p>',
    r'<div class="summary__content[^"]*">.*?<p>\s*(.*?)\s*</p>',
    r'<div class="manga-excerpt">\s*(?:<p>)?\s*(.*?)\s*(?:</p>)?\s*</div>',
    r'<meta name="description" content="([^"]+)"',
)


class MadaraSource:
    """Fonte Madara parametrizada por dominio e path.

    `manga_paths` e uma lista porque o site pode servir o mesmo conteudo sob
    mais de um prefixo (a busca devolve /obra/, mas /manga/ tambem responde);
    o primeiro item e o usado para montar URLs, os demais so para reconhecer
    slugs vindos da busca.
    """

    def __init__(
        self,
        source_id: str,
        name: str,
        base_url: str,
        manga_paths: tuple[str, ...] = ("manga",),
        risk: str = "high",
    ) -> None:
        self._id = source_id
        self._name = name
        self._base_url = base_url.rstrip("/")
        self._manga_paths = manga_paths
        self._risk = risk

    @property
    def info(self) -> SourceInfo:
        return SourceInfo(
            id=self._id,
            name=self._name,
            supports_search=True,
            supports_pages=True,
            risk=self._risk,
        )

    @property
    def _manga_path(self) -> str:
        return self._manga_paths[0]

    def _manga_url(self, manga_source_id: str) -> str:
        return f"{self._base_url}/{self._manga_path}/{manga_source_id}/"

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        response = await get_client().get(
            f"{self._base_url}/",
            params={"s": query, "post_type": "wp-manga"},
            headers=BROWSER_HEADERS,
        )
        if response.status_code != 200:
            return []

        results: list[MangaSearchResult] = []
        seen: set[str] = set()

        # O tema envolve cada resultado nesse bloco; dividir por ele isola os
        # campos de um item sem precisar casar a arvore de tags inteira.
        for block in response.text.split('class="row c-tabs-item__content"')[1:]:
            url_m = re.search(r'href="([^"]+)"', block)
            title_m = re.search(r'title="([^"]+)"', block)
            if not url_m or not title_m:
                continue

            slug = self._slug_from_url(url_m.group(1).strip())
            if not slug or slug in seen:
                continue
            seen.add(slug)

            title = html.unescape(title_m.group(1).strip())
            results.append(
                MangaSearchResult(
                    source=self.info.id,
                    source_id=slug,
                    title=title,
                    cover_url=_first_image(block),
                    score=title_score(query, [title]),
                )
            )

        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]

    def _slug_from_url(self, url: str) -> str | None:
        """Extrai o slug do manga de uma URL de resultado da busca."""
        for path in self._manga_paths:
            match = re.search(rf'/{re.escape(path)}/([^/?#]+)', url)
            if match:
                return match.group(1)
        return None

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        response = await get_client().get(
            self._manga_url(manga_source_id), headers=BROWSER_HEADERS
        )
        response.raise_for_status()
        text = response.text

        title = _first_match(text, _TITLE_PATTERNS)
        title = self._clean_title(title) if title else manga_source_id

        cover = _first_match(text, _COVER_PATTERNS)

        raw_description = _first_match(text, _DESCRIPTION_PATTERNS)
        description = _strip_tags(raw_description) if raw_description else None

        return MangaSearchResult(
            source=self.info.id,
            source_id=manga_source_id,
            title=title,
            cover_url=cover,
            description=description,
            genres=normalize_genres(_extract_genres(text)),
            score=1.0,
        )

    def _clean_title(self, title: str) -> str:
        """Remove o sufixo do site que o `og:title` carrega.

        Fallback de `og:title` so entra quando o site nao tem `div.post-title`,
        e ai o valor vem como "Nome da Obra - Nome do Site".
        """
        title = _strip_tags(title)
        suffix = re.search(rf'\s+[-|–]\s+{re.escape(self._name)}$', title)
        return title[: suffix.start()] if suffix else title

    async def chapters(self, manga_source_id: str, language: str = "pt-br") -> list[Chapter]:
        # Sites Madara PT-BR sao monolingues; `language` e ignorado de proposito.
        response = await get_client().get(
            self._manga_url(manga_source_id), headers=BROWSER_HEADERS
        )
        response.raise_for_status()
        text = response.text

        links = self._parse_chapter_links(text, manga_source_id)
        if not links:
            # Boa parte dos sites nao entrega a lista no HTML inicial: o tema
            # carrega os capitulos por AJAX depois que a pagina abre.
            ajax = await self._fetch_chapters_ajax(manga_source_id, text)
            if ajax:
                links = self._parse_chapter_links(ajax, manga_source_id)

        chapters: list[Chapter] = []
        seen: set[str] = set()

        for chapter_slug, raw_title in links:
            if chapter_slug in seen:
                continue
            clean_title = _strip_tags(raw_title)
            seen.add(chapter_slug)

            label = _chapter_label(chapter_slug)
            chapters.append(
                Chapter(
                    source=self.info.id,
                    source_id=f"{manga_source_id}{ID_SEPARATOR}{chapter_slug}",
                    manga_source_id=manga_source_id,
                    title=clean_title or label,
                    chapter=label,
                    language="pt-br",
                    normalized_number=parse_chapter_number(label, clean_title),
                    sort_key=chapter_sort_key(label, clean_title),
                )
            )

        return sorted(chapters, key=lambda item: item.sort_key)

    def _parse_chapter_links(self, text: str, manga_source_id: str) -> list[tuple[str, str]]:
        """Devolve (slug_do_capitulo, titulo_bruto) dos links sob o manga.

        re.escape no slug: ele vem da URL do cliente e um "." ou "+" ali
        viraria metacaractere dentro do padrao.
        """
        slug = re.escape(manga_source_id)
        paths = "|".join(re.escape(path) for path in self._manga_paths)
        # O href pode vir absoluto ou relativo dependendo do site.
        pattern = (
            rf'<a\s+href="(?:{re.escape(self._base_url)})?/(?:{paths})/{slug}/'
            rf'([^/"?#]+)/?"[^>]*>\s*(.*?)\s*</a>'
        )
        found: list[tuple[str, str]] = []
        for chapter_slug, raw_title in re.findall(pattern, text, re.DOTALL):
            if chapter_slug.lower() in _NOT_A_CHAPTER:
                continue
            if _strip_tags(raw_title).lower() in _SKIP_CHAPTER_TITLES:
                continue
            found.append((chapter_slug, raw_title))
        return found

    async def _fetch_chapters_ajax(self, manga_source_id: str, page_html: str) -> str | None:
        """Pede a lista de capitulos pelos dois endpoints AJAX do Madara.

        O endpoint por slug e o das versoes novas do tema; o `admin-ajax.php`
        com `manga_get_chapters` e o legado e exige o id numerico do post,
        que so da para descobrir lendo a pagina.
        """
        client = get_client()

        response = await client.post(
            f"{self._manga_url(manga_source_id)}ajax/chapters/", headers=AJAX_HEADERS
        )
        if response.status_code == 200 and "wp-manga-chapter" in response.text:
            return response.text

        post_id = _extract_post_id(page_html)
        if not post_id:
            return None

        response = await client.post(
            f"{self._base_url}/wp-admin/admin-ajax.php",
            headers=AJAX_HEADERS,
            data={"action": "manga_get_chapters", "manga": post_id},
        )
        if response.status_code == 200 and "wp-manga-chapter" in response.text:
            return response.text
        return None

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        manga_id, _, chapter_id = chapter_source_id.partition(ID_SEPARATOR)
        if not chapter_id:
            # Sem separador nao da para remontar a URL do capitulo.
            return ChapterPages(
                source=self.info.id,
                source_chapter_id=chapter_source_id,
                page_urls=[],
                data_saver=data_saver,
            )

        response = await get_client().get(
            f"{self._manga_url(manga_id)}{chapter_id}/", headers=BROWSER_HEADERS
        )
        response.raise_for_status()

        page_urls: list[str] = []
        for match in re.finditer(r"<img([^>]+)>", response.text):
            attrs = match.group(1)
            if "wp-manga-chapter-img" not in attrs:
                continue
            url = _image_url(attrs)
            if url:
                page_urls.append(url)

        return ChapterPages(
            source=self.info.id,
            source_chapter_id=chapter_source_id,
            page_urls=page_urls,
            data_saver=data_saver,
        )


def _first_match(text: str, patterns: tuple[str, ...]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            value = match.group(1).strip()
            if value:
                return value
    return None


def _strip_tags(raw: str) -> str:
    return html.unescape(re.sub(r"<[^>]*>", "", raw)).strip()


def _image_url(attrs: str) -> str | None:
    """Le a URL real de um <img>, preferindo `data-src`.

    Com lazyload o `src` guarda um placeholder (1x1 ou base64) e a imagem de
    verdade fica em `data-src`. O valor costuma vir quebrado em varias linhas
    dentro do atributo, dai o strip.
    """
    for attr in ("data-src", "data-lazy-src", "src"):
        match = re.search(rf'\s{re.escape(attr)}=["\']\s*([^"\']+?)\s*["\']', attrs)
        if match:
            url = match.group(1).strip()
            if url.startswith("http"):
                return url
    return None


def _first_image(block: str) -> str | None:
    for pattern in (r'data-src="\s*(https?://[^"]+?)\s*"', r'\ssrc="\s*(https?://[^"]+?)\s*"'):
        match = re.search(pattern, block)
        if match:
            return match.group(1).strip()
    return None


def _extract_post_id(page_html: str) -> str | None:
    """Acha o id numerico do post do manga para o AJAX legado."""
    for pattern in (
        r'<div[^>]+id="manga-chapters-holder"[^>]+data-id="(\d+)"',
        r"postid-(\d+)",
        r"shortlink['\"][^>]*[?&]p=(\d+)",
        r'data-id="(\d+)"',
    ):
        match = re.search(pattern, page_html)
        if match:
            return match.group(1)
    return None


def _chapter_label(chapter_slug: str) -> str:
    """Transforma o slug do capitulo no rotulo numerico exibido.

    "capitulo-16-5" vira "16.5". Slugs sem numero ("one-shot-especial") ficam
    como estao: trocar hifen por ponto ali so produziria ruido, e o
    `chapter_sort_key` ja sabe classificar esses como especiais.
    """
    label = chapter_slug
    lowered = label.lower()
    for prefix in _CHAPTER_PREFIXES:
        if lowered.startswith(prefix):
            label = label[len(prefix):]
            break
    if re.fullmatch(r"\d+(?:-\d+)*", label):
        return label.replace("-", ".")
    return chapter_slug


def _extract_genres(text: str) -> list[str]:
    """Le os generos do bloco `genres-content`, ou dos links de genero."""
    genres: list[str] = []

    block = re.search(r'class="genres-content">(.*?)</div>', text, re.DOTALL)
    if block:
        found = re.findall(r"<a[^>]*>\s*(.*?)\s*</a>", block.group(1), re.DOTALL)
    else:
        # Alguns sites nao usam o bloco e listam os generos soltos, so como link.
        found = re.findall(
            r'href="[^"]*/(?:genero|generos|manga-genre|genre)/[^"]*"[^>]*>\s*([^<]{1,40}?)\s*</a>',
            text,
        )

    for raw in found:
        name = _strip_tags(raw)
        if name and name not in genres:
            genres.append(name)
    return genres[:12]
