export interface MangaMetadata {
  id: string;
  title: string;
  coverUrl: string;
  description: string;
  author?: string;
  genres?: string[];
  status?: string;
  averageScore?: number;
}

export class MetadataService {
  private static ANILIST_API = 'https://graphql.anilist.co';

  static async searchAniList(rawQuery: string): Promise<MangaMetadata[]> {
    const query = this.cleanSearchQuery(rawQuery);
    if (!query) return [];

    const graphqlQuery = `
      query ($search: String) {
        Page(page: 1, perPage: 5) {
          media(search: $search, type: MANGA) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            description(asHtml: false)
            genres
            status
            averageScore
            staff {
              nodes {
                name {
                  full
                }
              }
            }
          }
        }
      }
    `;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(this.ANILIST_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query: graphqlQuery, variables: { search: query } }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error('AniList HTTP error:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();

      // Log GraphQL errors if present (but don't abort — partial data may still be usable)
      if (data?.errors?.length) {
        console.warn('AniList GraphQL errors:', data.errors);
      }

      if (!data?.data?.Page?.media) return [];

      return data.data.Page.media.map((m: any) => ({
        id: String(m.id),
        title: m.title?.english || m.title?.romaji || 'Sem título',
        coverUrl: m.coverImage?.large ?? '',
        description: m.description ?? '',
        author: m.staff?.nodes?.[0]?.name?.full ?? undefined,
        genres: Array.isArray(m.genres) ? m.genres.slice(0, 5) : [],
        status: m.status ?? undefined,
        averageScore: m.averageScore ?? undefined
      }));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.warn('AniList: timeout após 10s');
      } else {
        console.error('AniList fetch error:', err);
      }
      return [];
    }
  }

  /**
   * Strips volume/chapter markers, numbers and separators from a filename
   * so the result is a clean title usable as an AniList search query.
   * e.g. "ajin.01 vol.pdf" → "ajin"
   *      "One Piece - Vol. 03 [Group].pdf" → "One Piece"
   *      "Berserk_v01_c001_[Scan].pdf" → "Berserk"
   */
  static extractTitleFromFilename(filename: string): string {
    return filename
      // 1. drop file extension
      .replace(/\.[^/.]+$/, '')
      // 2. remove bracketed/parenthesised tags  [Group] (Digital)
      .replace(/[\[\(][^\]\)]*[\]\)]/g, '')
      // 3. remove vol/volume/ch/chapter/tome/ep + optional number
      .replace(/\b(vol|volume|v|ch|cap|chapter|tome|ep|episode|scan)\b\.?\s*\d*(\.\d+)?/gi, '')
      // 4. remove ".number" patterns used as version separators  .01  .001
      .replace(/\.\d+/g, '')
      // 5. replace underscores and dashes with spaces
      .replace(/[_-]+/g, ' ')
      // 6. remove remaining standalone numbers
      .replace(/\b\d+\b/g, '')
      // 7. collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Removes special characters and normalises unicode for use as an API search term.
   */
  static cleanSearchQuery(query: string): string {
    return query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics (é→e, ã→a)
      .replace(/[^\w\s]/g, ' ')         // remove remaining non-word chars
      .replace(/\s+/g, ' ')
      .trim();
  }
}
