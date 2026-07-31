const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

/**
 * O backend devolve caminhos relativos ("/image?url=...") para imagens de fontes
 * que nao enviam CORS. Resolve esses caminhos contra a API; URLs absolutas e
 * object URLs (blob:) passam intactas.
 */
export function resolveImageUrl(url: string | undefined | null): string | undefined {
	if (!url) return undefined;
	if (url.startsWith('/')) return `${API_BASE}${url}`;
	return url;
}

export interface SourceInfo {
	id: string;
	name: string;
}

export interface MangaSearchResult {
	source_id: string;
	source: string;
	title: string;
	cover_url?: string;
	description?: string;
	score: number;
}

export interface Chapter {
	source_id: string;
	manga_source_id: string;
	source: string;
	title?: string;
	chapter?: string;
	volume?: string;
	language?: string;
}

export interface ChapterPages {
	source_chapter_id: string;
	source: string;
	page_urls: string[];
}

/** Erro de API com a mensagem em portugues que a UI mostra ao usuario. */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
	const url = new URL(`${API_BASE}${path}`);
	for (const [key, value] of Object.entries(params ?? {})) {
		url.searchParams.append(key, value);
	}

	let response: Response;
	try {
		response = await fetch(url.toString());
	} catch {
		throw new ApiError('Não foi possível conectar ao servidor do Hiraku.', 0);
	}

	if (!response.ok) {
		// 502 significa que a fonte externa falhou, não o nosso backend.
		const message =
			response.status === 502
				? 'A fonte está indisponível no momento. Tente outra fonte ou tente de novo mais tarde.'
				: response.status === 404
					? 'Conteúdo não encontrado nesta fonte.'
					: 'Falha ao comunicar com o servidor.';
		throw new ApiError(message, response.status);
	}

	return response.json() as Promise<T>;
}

export class BackendApiService {
	static getSources(): Promise<SourceInfo[]> {
		return request<SourceInfo[]>('/sources');
	}

	static search(query: string, source?: string): Promise<MangaSearchResult[]> {
		return request<MangaSearchResult[]>('/manga/search', {
			q: query,
			...(source ? { source } : {})
		});
	}

	static getDetail(source: string, source_manga_id: string): Promise<MangaSearchResult> {
		return request<MangaSearchResult>(`/manga/${source}/${source_manga_id}`);
	}

	static getChapters(
		source: string,
		source_manga_id: string,
		language: string = 'pt-br'
	): Promise<Chapter[]> {
		return request<Chapter[]>(`/manga/${source}/${source_manga_id}/chapters`, { language });
	}

	static getPages(
		source: string,
		source_chapter_id: string,
		dataSaver: boolean = false
	): Promise<ChapterPages> {
		return request<ChapterPages>(`/chapters/${source}/${source_chapter_id}/pages`, {
			...(dataSaver ? { data_saver: 'true' } : {})
		});
	}
}
