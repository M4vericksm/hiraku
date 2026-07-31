import re
import html
import httpx
from typing import Any

from app.core.config import settings
from app.domain.schemas import Chapter, ChapterPages, MangaSearchResult, SourceInfo
from app.sources.normalization import chapter_sort_key, parse_chapter_number, title_score


class MangaLivreSource:
    @property
    def info(self) -> SourceInfo:
        return SourceInfo(
            id="mangalivre",
            name="MangaLivre (Clone)",
            supports_search=True,
            supports_pages=True,
            risk="high",
        )

    async def search(self, query: str, limit: int = 10) -> list[MangaSearchResult]:
        url = "https://mangalivre.to/"
        params = {
            "s": query,
            "post_type": "wp-manga"
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params, headers=headers)
            if response.status_code != 200:
                return []
            
            text = response.text
            
            # Split search results by the row c-tabs-item__content blocks
            blocks = text.split('class="row c-tabs-item__content"')
            results: list[MangaSearchResult] = []
            
            for block in blocks[1:]:
                # Extract URL, Title, and Cover
                url_m = re.search(r'href="([^"]+)"', block)
                title_m = re.search(r'title="([^"]+)"', block)
                src_m = re.search(r'src="([^"]+)"', block)
                
                if url_m and title_m:
                    manga_url = url_m.group(1).strip()
                    title = html.unescape(title_m.group(1).strip())
                    cover = src_m.group(1).strip() if src_m else None
                    
                    # Extract the manga slug from the URL
                    # e.g., https://mangalivre.to/manga/one-punch-man/ -> one-punch-man
                    slug_match = re.search(r'/manga/([^/]+)/?', manga_url)
                    if slug_match:
                        slug = slug_match.group(1)
                        # Avoid duplicate results
                        if any(r.source_id == slug for r in results):
                            continue
                            
                        # Calculate scores
                        score = title_score(query, [title])
                        results.append(
                            MangaSearchResult(
                                source=self.info.id,
                                source_id=slug,
                                title=title,
                                cover_url=cover,
                                score=score
                            )
                        )
            
            # Sort and return up to limit
            return sorted(results, key=lambda x: x.score, reverse=True)[:limit]

    async def detail(self, manga_source_id: str) -> MangaSearchResult:
        url = f"https://mangalivre.to/manga/{manga_source_id}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            text = response.text
            
            title_m = re.search(r'<div class="post-title">\s*<h1>\s*(.*?)\s*</h1>', text)
            title = html.unescape(title_m.group(1).strip()) if title_m else manga_source_id
            
            cover_m = re.search(r'class="summary_image">.*?src=["\']\s*(https://[^"\']+)["\']', text, re.DOTALL)
            cover = cover_m.group(1).strip() if cover_m else None
            
            desc_m = re.search(r'<div class="description-summary">.*?<p>\s*(.*?)\s*</p>', text, re.DOTALL)
            if not desc_m:
                desc_m = re.search(r'<div class="summary__content">.*?<p>\s*(.*?)\s*</p>', text, re.DOTALL)
                
            description = None
            if desc_m:
                description = html.unescape(re.sub(r'<[^>]*>', '', desc_m.group(1)).strip())
                
            return MangaSearchResult(
                source=self.info.id,
                source_id=manga_source_id,
                title=title,
                cover_url=cover,
                description=description,
                score=1.0
            )

    async def chapters(self, manga_source_id: str, language: str = "pt-br") -> list[Chapter]:
        # MangaLivre is PT-BR only, ignore language query parameter
        url = f"https://mangalivre.to/manga/{manga_source_id}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            text = response.text
            
            # Find all anchor tags that contain the chapter links
            # Format: <a href="https://mangalivre.to/manga/{manga_source_id}/capitulo-([^/"]+)/?"> title </a>
            pattern = rf'<a href="(https://mangalivre\.to/manga/{manga_source_id}/(capitulo-([^/"]+))/?)"[^>]*>\s*(.*?)\s*</a>'
            ch_matches = re.findall(pattern, text, re.DOTALL)
            
            seen_urls = set()
            chapters: list[Chapter] = []
            
            for link, raw_chapter_id, ch_num_str, raw_title in ch_matches:
                clean_title = html.unescape(re.sub(r'<[^>]*>', '', raw_title).strip())
                if link in seen_urls:
                    continue
                if "ler último capítulo" in clean_title.lower() or "ler primeiro capítulo" in clean_title.lower():
                    continue
                    
                seen_urls.add(link)
                
                # Combine manga ID and chapter ID for the source_id
                combined_id = f"{manga_source_id}___{raw_chapter_id}"
                
                # Try to parse chapter number
                chapter_num = ch_num_str.replace("-", ".")
                norm_number = parse_chapter_number(chapter_num, clean_title)
                sort_key = chapter_sort_key(chapter_num, clean_title)
                
                chapters.append(
                    Chapter(
                        source=self.info.id,
                        source_id=combined_id,
                        manga_source_id=manga_source_id,
                        title=clean_title,
                        chapter=chapter_num,
                        language="pt-br",
                        normalized_number=norm_number,
                        sort_key=sort_key
                    )
                )
            
            # Return chapters sorted by sort_key
            return sorted(chapters, key=lambda x: x.sort_key)

    async def pages(self, chapter_source_id: str, data_saver: bool = False) -> ChapterPages:
        # chapter_source_id is "manga_id___chapter_id"
        parts = chapter_source_id.split("___")
        if len(parts) == 2:
            manga_id, chapter_id = parts
        else:
            # Fallback if separator is different
            manga_id = "unknown"
            chapter_id = chapter_source_id
            
        url = f"https://mangalivre.to/manga/{manga_id}/{chapter_id}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            text = response.text
            
            # Parse all image elements with class wp-manga-chapter-img
            page_urls = []
            for match in re.finditer(r'<img([^>]+)>', text):
                tag_content = match.group(1)
                if 'wp-manga-chapter-img' in tag_content:
                    src_m = re.search(r'src=["\']\s*(https://[^"\']+)["\']', tag_content)
                    if src_m:
                        page_urls.append(src_m.group(1).strip())
            
            return ChapterPages(
                source=self.info.id,
                source_chapter_id=chapter_source_id,
                page_urls=page_urls,
                data_saver=data_saver
            )
