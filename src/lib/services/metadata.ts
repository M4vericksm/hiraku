export interface MangaMetadata {
  id: string;
  title: string;
  coverUrl: string;
  description: string;
  author?: string;
  genres?: string[];
  status?: string;
  averageScore?: number;
  startYear?: number;
}

export class MetadataService {
  private static ANILIST_API = 'https://graphql.anilist.co';

  static async searchAniList(rawQuery: string): Promise<MangaMetadata[]> {
    const query = this.cleanSearchQuery(rawQuery);
    if (!query) return [];

    // Sort by SEARCH_MATCH for best relevance. perPage 8 gives user enough to pick from.
    const gql = `
      query ($search: String) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
            id
            title { romaji english native }
            coverImage { large medium }
            description(asHtml: false)
            genres
            status
            averageScore
            startDate { year }
            staff {
              nodes { name { full } }
            }
          }
        }
      }
    `;

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(this.ANILIST_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query: gql, variables: { search: query } }),
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        console.error('AniList HTTP error:', res.status, res.statusText);
        return [];
      }

      const data = await res.json();

      if (data?.errors?.length) {
        console.warn('AniList GraphQL errors:', JSON.stringify(data.errors));
      }

      const media: any[] = data?.data?.Page?.media;
      if (!Array.isArray(media) || media.length === 0) return [];

      return media.map((m) => ({
        id: String(m.id),
        // Prefer English title, fall back to romaji, then native
        title: m.title?.english || m.title?.romaji || m.title?.native || 'Sem título',
        coverUrl: m.coverImage?.large || m.coverImage?.medium || '',
        description: m.description ?? '',
        author: m.staff?.nodes?.[0]?.name?.full ?? undefined,
        genres: Array.isArray(m.genres) ? m.genres.slice(0, 5) : [],
        status: m.status ?? undefined,
        averageScore: m.averageScore ?? undefined,
        startYear: m.startDate?.year ?? undefined,
      }));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.warn('AniList: timeout after 12s');
      } else {
        console.error('AniList fetch error:', err);
      }
      return [];
    }
  }

  /**
   * Strips volume/chapter markers, separators and noise from a filename
   * to produce a clean title suitable for AniList search.
   *
   * Examples:
   *   "AJIN VOL.01.pdf"          → "AJIN"
   *   "One.Piece.v01.pdf"        → "One Piece"
   *   "Berserk_v38_[Group].pdf"  → "Berserk"
   *   "ajin vol 3.pdf"           → "ajin"
   *   "One Piece - Vol. 03.pdf"  → "One Piece"
   */
  static extractTitleFromFilename(filename: string): string {
    return (
      filename
        // 1. Drop file extension (.pdf, .cbz, etc.)
        .replace(/\.[^/.]+$/, '')
        // 2. Remove bracketed/parenthesised noise: [Group], (Digital), {tag}
        .replace(/[\[({][^\]})]*[\])}]/g, '')
        // 3. Replace dots/underscores used as word separators
        //    "One.Piece" → "One Piece", "berserk_vol" → "berserk vol"
        .replace(/([a-zA-Z0-9])([._])([a-zA-Z0-9])/g, '$1 $3')
        // Run twice to catch consecutive dots: "a.b.c" → "a b.c" → "a b c"
        .replace(/([a-zA-Z0-9])([._])([a-zA-Z0-9])/g, '$1 $3')
        // 4. Remove volume/chapter markers + their number
        //    "Vol 01", "volume 3", "ch.5", "tome 2", "ep 10"
        .replace(/\b(volume|vol|ch|cap|chapter|tome|ep|episode|scan)\b\.?\s*\d*(\.\d+)?/gi, '')
        // 5. Remove "v01" / "v001" style shorthand (must come after dot-separator handling)
        .replace(/\bv\d+\b/gi, '')
        // 6. Remove remaining isolated numbers (chapter/volume digits left over)
        .replace(/\b\d{1,4}\b/g, '')
        // 7. Collapse and trim
        .replace(/[-\s]+/g, ' ')
        .trim()
    );
  }

  /**
   * Normalises a query string for AniList: strips diacritics and
   * removes characters that could break the search.
   */
  static cleanSearchQuery(raw: string): string {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics: é→e, ã→a
      .replace(/[^\w\s]/g, ' ')         // remove remaining non-word chars
      .replace(/\s+/g, ' ')
      .trim();
  }
}
