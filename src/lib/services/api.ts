const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

/** Requisicoes JSON sao curtas; imagens podem demorar bem mais. */
const JSON_TIMEOUT_MS = 15_000;
export const IMAGE_TIMEOUT_MS = 30_000;

/** Duas retentativas com espera crescente antes de desistir. */
const RETRY_DELAYS_MS = [400, 1200];

/** Status em que vale tentar de novo: a fonte pode voltar em segundos. */
const RETRIABLE_STATUS = new Set([502, 503, 504]);

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
	alt_titles?: string[];
	cover_url?: string;
	description?: string;
	/**
	 * Slugs canonicos de genero (ver `backend/app/sources/genres.py`). Vem vazio
	 * quando a fonte nao expoe genero naquele endpoint — a busca do MangaLivre,
	 * por exemplo, so devolve titulo e capa.
	 */
	genres?: string[];
	score: number;
}

/** Slug de genero com o rotulo em portugues que a UI mostra. */
export interface GenreInfo {
	slug: string;
	label: string;
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

/**
 * Cancelamento pedido por quem chamou (troca de capitulo, saida da tela). Nao e
 * falha: a UI deve ignorar em vez de mostrar erro.
 */
export class AbortedError extends Error {
	constructor() {
		super('Requisição cancelada.');
		this.name = 'AbortedError';
	}
}

export function isAborted(err: unknown): err is AbortedError {
	return err instanceof AbortedError;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new AbortedError());
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(new AbortedError());
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Une o signal de quem chamou com um timeout proprio. Sem isso uma requisicao
 * pendurada deixa a tela em "carregando" para sempre.
 *
 * AbortSignal.any nao existe em WebViews antigas; o fallback encadeia na mao.
 */
function withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	if (!signal) return timeout;
	if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);

	const controller = new AbortController();
	const abort = () => controller.abort();
	if (signal.aborted || timeout.aborted) abort();
	signal.addEventListener('abort', abort, { once: true });
	timeout.addEventListener('abort', abort, { once: true });
	return controller.signal;
}

/**
 * Traduz a falha do fetch. Separa tres casos que antes viravam o mesmo erro:
 * cancelamento pedido por nos, estouro do timeout, e rede realmente fora.
 */
function networkError(err: unknown, callerSignal?: AbortSignal): Error {
	if (callerSignal?.aborted) return new AbortedError();
	if (err instanceof DOMException && err.name === 'TimeoutError') {
		return new ApiError('O servidor demorou demais para responder.', 0);
	}
	return new ApiError('Não foi possível conectar ao servidor do Hiraku.', 0);
}

function messageForStatus(status: number): string {
	// 502 significa que a fonte externa falhou, não o nosso backend.
	if (status === 502) {
		return 'A fonte está indisponível no momento. Tente outra fonte ou tente de novo mais tarde.';
	}
	if (status === 503 || status === 504) {
		return 'O servidor está sobrecarregado. Tente de novo em instantes.';
	}
	if (status === 404) return 'Conteúdo não encontrado nesta fonte.';
	return 'Falha ao comunicar com o servidor.';
}

interface RequestOptions {
	params?: Record<string, string>;
	signal?: AbortSignal;
	timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { params, signal, timeoutMs = JSON_TIMEOUT_MS } = options;

	const url = new URL(`${API_BASE}${path}`);
	for (const [key, value] of Object.entries(params ?? {})) {
		url.searchParams.append(key, value);
	}

	let lastError: Error = new ApiError('Falha ao comunicar com o servidor.', 0);

	for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
		if (signal?.aborted) throw new AbortedError();

		let response: Response;
		try {
			response = await fetch(url.toString(), { signal: withTimeout(timeoutMs, signal) });
		} catch (err) {
			lastError = networkError(err, signal);
			// Cancelamento e decisao de quem chamou: nao insiste.
			if (lastError instanceof AbortedError) throw lastError;
			if (attempt === RETRY_DELAYS_MS.length) throw lastError;
			await sleep(RETRY_DELAYS_MS[attempt], signal);
			continue;
		}

		if (response.ok) {
			return (await response.json()) as T;
		}

		lastError = new ApiError(messageForStatus(response.status), response.status);
		// 404 nao melhora tentando de novo.
		if (!RETRIABLE_STATUS.has(response.status) || attempt === RETRY_DELAYS_MS.length) {
			throw lastError;
		}
		await sleep(RETRY_DELAYS_MS[attempt], signal);
	}

	throw lastError;
}

/**
 * Busca uma imagem com o mesmo tratamento de timeout/abort das chamadas JSON.
 * Usado pelo download offline, que antes chamava fetch direto e podia pendurar.
 */
export async function fetchImageBlob(url: string, signal?: AbortSignal): Promise<Blob> {
	let response: Response;
	try {
		response = await fetch(url, { signal: withTimeout(IMAGE_TIMEOUT_MS, signal) });
	} catch (err) {
		throw networkError(err, signal);
	}
	if (!response.ok) {
		throw new ApiError(messageForStatus(response.status), response.status);
	}
	return response.blob();
}

export class BackendApiService {
	static getSources(signal?: AbortSignal): Promise<SourceInfo[]> {
		return request<SourceInfo[]>('/sources', { signal });
	}

	/** Catalogo de generos conhecidos, para o filtro do catalogo. */
	static getGenres(signal?: AbortSignal): Promise<GenreInfo[]> {
		return request<GenreInfo[]>('/genres', { signal });
	}

	static search(query: string, source?: string, signal?: AbortSignal): Promise<MangaSearchResult[]> {
		return request<MangaSearchResult[]>('/manga/search', {
			params: { q: query, ...(source ? { source } : {}) },
			signal
		});
	}

	static getDetail(
		source: string,
		source_manga_id: string,
		signal?: AbortSignal
	): Promise<MangaSearchResult> {
		return request<MangaSearchResult>(`/manga/${source}/${source_manga_id}`, { signal });
	}

	static getChapters(
		source: string,
		source_manga_id: string,
		language: string = 'pt-br',
		signal?: AbortSignal
	): Promise<Chapter[]> {
		return request<Chapter[]>(`/manga/${source}/${source_manga_id}/chapters`, {
			params: { language },
			signal
		});
	}

	static getPages(
		source: string,
		source_chapter_id: string,
		dataSaver: boolean = false,
		signal?: AbortSignal
	): Promise<ChapterPages> {
		return request<ChapterPages>(`/chapters/${source}/${source_chapter_id}/pages`, {
			params: { ...(dataSaver ? { data_saver: 'true' } : {}) },
			signal
		});
	}
}
