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

  static async searchAniList(query: string): Promise<MangaMetadata[]> {
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
            staff(perPage: 1) {
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

  static extractTitleFromFilename(filename: string): string {
    return filename
      .replace(/\.[^/.]+$/, '')
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/[\s_-]+/g, ' ')
      .trim();
  }
}
