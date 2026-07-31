from pydantic import BaseModel, Field, HttpUrl


class SourceInfo(BaseModel):
    id: str
    name: str
    supports_search: bool = True
    supports_pages: bool = True
    risk: str = "medium"


class MangaSearchResult(BaseModel):
    source: str
    source_id: str
    title: str
    alt_titles: list[str] = Field(default_factory=list)
    description: str | None = None
    # URL absoluta da fonte, ou caminho relativo do nosso proxy ("/image?url=...")
    # quando a fonte nao envia cabecalho CORS.
    cover_url: str | None = None
    language: str | None = None
    score: float = Field(default=0, ge=0, le=1)


class Chapter(BaseModel):
    source: str
    source_id: str
    manga_source_id: str
    title: str | None = None
    chapter: str | None = None
    volume: str | None = None
    language: str | None = None
    pages: int | None = None
    external_url: HttpUrl | None = None
    normalized_number: float | None = None
    sort_key: tuple[int, float, str]


class ChapterPages(BaseModel):
    source: str
    source_chapter_id: str
    page_urls: list[str]
    data_saver: bool = False
