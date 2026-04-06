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
            description
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
      const response = await fetch(this.ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { search: query }
        })
      });

      const data = await response.json();
      return data.data.Page.media.map((m: any) => ({
        id: String(m.id),
        title: m.title.english || m.title.romaji,
        coverUrl: m.coverImage.large,
        description: m.description,
        author: m.staff?.nodes[0]?.name?.full,
        genres: m.genres?.slice(0, 5) ?? [],
        status: m.status,
        averageScore: m.averageScore
      }));
    } catch (err) {
      console.error('Erro AniList', err);
      return [];
    }
  }

  static async extractTitleFromFilename(filename: string): Promise<string> {
    // Remove extensões e limpa nomes comuns [ Fansub ], ( Volume 01 ), etc.
    return filename
      .replace(/\.[^/.]+$/, "")
      .replace(/\[.*?\]|\(.*?\)/g, "")
      .trim();
  }
}
