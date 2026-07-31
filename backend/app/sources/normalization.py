import re
import unicodedata

CHAPTER_NUMBER_RE = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)(?!\d)")


def normalize_title(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def title_score(query: str, candidates: list[str]) -> float:
    normalized_query = normalize_title(query)
    if not normalized_query:
        return 0

    best = 0.0
    query_tokens = set(normalized_query.split())
    for candidate in candidates:
        normalized_candidate = normalize_title(candidate)
        if not normalized_candidate:
            continue
        if normalized_candidate == normalized_query:
            best = max(best, 1.0)
        elif normalized_candidate.startswith(f"{normalized_query} "):
            best = max(best, 0.88)
        else:
            candidate_tokens = set(normalized_candidate.split())
            overlap = len(query_tokens & candidate_tokens)
            best = max(best, overlap / max(len(query_tokens), 1) * 0.7)
    return round(best, 4)


def parse_chapter_number(*values: str | None) -> float | None:
    for value in values:
        if not value:
            continue
        match = CHAPTER_NUMBER_RE.search(value)
        if match:
            return float(match.group(1).replace(",", "."))
    return None


def chapter_sort_key(chapter: str | None, title: str | None) -> tuple[int, float, str]:
    number = parse_chapter_number(chapter, title)
    if number is not None:
        return (0, number, normalize_title(title or chapter or ""))

    text = normalize_title(title or chapter or "")
    special_rank = 2 if any(word in text for word in ["extra", "special", "especial", "omake"]) else 1
    return (special_rank, 0, text)
