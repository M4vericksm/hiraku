import { BackendApiService, fetchImageBlob, isAborted, resolveImageUrl, type Chapter } from './api';

/**
 * `complete` = todas as paginas salvas. `partial` = o download parou no meio,
 * mas o que ja veio esta guardado e pode ser retomado.
 */
export type OfflineStatus = 'complete' | 'partial';

export interface OfflineChapterMeta {
	source: string;
	mangaId: string;
	chapterId: string;
	mangaTitle?: string;
	title?: string;
	chapter?: string;
	/** Quantas paginas estao salvas. */
	pageCount: number;
	/** Quantas paginas o capitulo tem no total. */
	totalPages: number;
	status: OfflineStatus;
	sizeBytes: number;
	downloadedAt: string;
}

/** Quantas paginas baixar ao mesmo tempo — equilibra velocidade e carga na fonte. */
const DOWNLOAD_CONCURRENCY = 4;

/** Tentativas por pagina antes de marcar o capitulo como parcial. */
const PAGE_ATTEMPTS = 3;
const PAGE_RETRY_DELAY_MS = 600;

/** Quanto tempo a lista de capitulos em cache continua valendo online. */
const CHAPTER_LIST_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Teto para a abertura do banco.
 *
 * `indexedDB.open` promete disparar `onsuccess`, `onerror` ou `onblocked`, mas
 * no WebView do Android com armazenamento restrito (modo anonimo, "limpar
 * dados de sites" agressivo) ele as vezes nao dispara nenhum dos tres. Todo
 * `await` a jusante ficava pendurado — foi assim que o leitor entrava em
 * "Carregando Páginas" para sempre, sem erro e sem paginas. Estourado o prazo,
 * tratamos como "sem armazenamento offline" e seguimos pela rede.
 */
const DB_OPEN_TIMEOUT_MS = 8_000;

interface StoredChapter {
	id: string;
	/** Esparso enquanto parcial: indices sem pagina ficam vazios. */
	pageBlobs: (Blob | undefined)[];
	/**
	 * URL de origem de cada pagina, na mesma ordem dos blobs.
	 *
	 * Guardado para retomar por URL e nao por posicao: quando a fonte insere
	 * uma pagina no meio (creditos, aviso da scan), o indice de tudo que vem
	 * depois anda um, e casar por posicao coleria a pagina errada. Ausente
	 * nos registros gravados antes desta versao.
	 */
	pageUrls?: string[];
}

interface StoredChapterList {
	id: string;
	chapters: Chapter[];
	cachedAt: number;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Erro de disco cheio, com mensagem que o usuario entende.
 *
 * O IndexedDB sinaliza falta de espaco abortando a transacao com um
 * `QuotaExceededError`; sem este envelope a UI cai no "tente novamente"
 * generico e o usuario tenta para sempre, porque tentar de novo nao
 * resolve — so apagar algo resolve.
 */
export class StorageFullError extends Error {
	constructor() {
		super('Sem espaço no dispositivo. Apague capítulos baixados e tente de novo.');
		this.name = 'StorageFullError';
	}
}

function isQuotaError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'QuotaExceededError';
}

class OfflineService {
	private dbName = 'hiraku-offline';
	private dbVersion = 2;
	private db: IDBDatabase | null = null;
	/**
	 * Abertura em voo. Sem isto, a lista de capitulos disparava um
	 * `getChapterStatus` por linha ao montar a pagina e cada um abria sua
	 * propria conexao — dezenas de `indexedDB.open` simultaneos vazando.
	 */
	private opening: Promise<IDBDatabase> | null = null;

	private initDB(): Promise<IDBDatabase> {
		if (this.db) return Promise.resolve(this.db);
		if (this.opening) return this.opening;

		this.opening = new Promise<IDBDatabase>((resolve, reject) => {
			if (typeof indexedDB === 'undefined') {
				reject(new Error('Armazenamento offline indisponível neste dispositivo.'));
				return;
			}

			const request = indexedDB.open(this.dbName, this.dbVersion);

			// Rede de seguranca: ver DB_OPEN_TIMEOUT_MS.
			const timer = setTimeout(() => {
				reject(new Error('Armazenamento offline não respondeu.'));
			}, DB_OPEN_TIMEOUT_MS);
			const settle = <T>(fn: (value: T) => void) => {
				return (value: T) => {
					clearTimeout(timer);
					fn(value);
				};
			};
			const done = settle(resolve);
			const fail = settle(reject);

			request.onerror = () => fail(request.error);
			request.onsuccess = () => {
				const db = request.result;
				// Outra aba pedindo upgrade: solta a conexao para nao trava-la.
				db.onversionchange = () => {
					db.close();
					this.db = null;
				};
				this.db = db;
				done(db);
			};

			// Outra aba antiga segura a versao anterior: sem isto o await
			// pendurava para sempre e a tela ficava em "carregando".
			request.onblocked = () =>
				fail(new Error('Feche as outras abas do Hiraku para atualizar o armazenamento.'));

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains('chapters')) {
					db.createObjectStore('chapters', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('metadata')) {
					db.createObjectStore('metadata', { keyPath: 'id' });
				}
				// v2: lista de capitulos em cache, para navegar offline.
				if (!db.objectStoreNames.contains('chapterLists')) {
					db.createObjectStore('chapterLists', { keyPath: 'id' });
				}
			};
		});

		// Uma falha nao pode deixar a promise rejeitada em cache: a proxima
		// chamada precisa poder tentar de novo.
		this.opening.catch(() => {
			this.opening = null;
		});

		return this.opening;
	}

	private get<T>(store: string, key: string): Promise<T | undefined> {
		return this.initDB().then(
			(db) =>
				new Promise<T | undefined>((resolve, reject) => {
					const request = db.transaction([store], 'readonly').objectStore(store).get(key);
					request.onsuccess = () => resolve(request.result as T | undefined);
					request.onerror = () => reject(request.error);
				})
		);
	}

	private getChapterKey(source: string, mangaId: string, chapterId: string): string {
		return `${source}:::${mangaId}:::${chapterId}`;
	}

	/**
	 * Baixa um capitulo para leitura offline.
	 *
	 * Diferente da versao anterior, uma pagina que falha nao joga fora o
	 * capitulo inteiro: cada pagina tem suas proprias tentativas, o que veio e
	 * gravado mesmo incompleto (status `partial`), e chamar de novo retoma só
	 * as paginas que faltam.
	 *
	 * Devolve o status final para quem chamou decidir se avisa o usuario.
	 */
	async downloadChapter(
		source: string,
		mangaId: string,
		chapterId: string,
		meta: { title?: string; chapter?: string; mangaTitle?: string },
		onProgress?: (progress: number) => void,
		signal?: AbortSignal
	): Promise<OfflineStatus> {
		const key = this.getChapterKey(source, mangaId, chapterId);

		const pagesInfo = await BackendApiService.getPages(source, chapterId, false, signal);
		const urls = pagesInfo.page_urls;
		if (urls.length === 0) {
			throw new Error('Este capítulo não tem páginas disponíveis.');
		}

		// Retoma de onde parou: o que ja esta salvo nao baixa de novo.
		const existing = await this.get<StoredChapter>('chapters', key);
		const pageBlobs: (Blob | undefined)[] = new Array(urls.length);

		if (existing?.pageBlobs?.length) {
			if (existing.pageUrls?.length === existing.pageBlobs.length) {
				// Caminho novo: casa por URL, entao a fonte pode ter inserido ou
				// removido paginas que o resto continua aproveitavel.
				const savedByUrl = new Map<string, Blob>();
				for (let i = 0; i < existing.pageUrls.length; i++) {
					const blob = existing.pageBlobs[i];
					if (blob) savedByUrl.set(existing.pageUrls[i], blob);
				}
				for (let i = 0; i < urls.length; i++) pageBlobs[i] = savedByUrl.get(urls[i]);
			} else if (existing.pageBlobs.length === urls.length) {
				// Registro antigo, sem URLs: so da para casar por posicao, e so
				// vale se a contagem bater.
				for (let i = 0; i < urls.length; i++) pageBlobs[i] = existing.pageBlobs[i];
			}
		}

		let completed = pageBlobs.filter(Boolean).length;
		let cursor = 0;
		const failed: number[] = [];
		onProgress?.(Math.round((completed / urls.length) * 100));

		// Baixa em paralelo mas preserva a ordem das páginas pelo índice.
		const worker = async () => {
			while (cursor < urls.length) {
				if (signal?.aborted) return;
				const index = cursor++;
				if (pageBlobs[index]) continue;

				const url = resolveImageUrl(urls[index]);
				if (!url) {
					failed.push(index);
					continue;
				}

				for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
					try {
						pageBlobs[index] = await fetchImageBlob(url, signal);
						completed++;
						onProgress?.(Math.round((completed / urls.length) * 100));
						break;
					} catch (err) {
						// Cancelamento nao e falha da pagina: encerra o worker.
						if (isAborted(err) || signal?.aborted) return;
						if (attempt === PAGE_ATTEMPTS) {
							console.error(`Página ${index + 1} falhou após ${PAGE_ATTEMPTS} tentativas`, err);
							failed.push(index);
						} else {
							await delay(PAGE_RETRY_DELAY_MS * attempt);
						}
					}
				}
			}
		};

		await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, urls.length) }, worker));

		const savedCount = pageBlobs.filter(Boolean).length;
		if (savedCount === 0) {
			throw new Error('Não foi possível baixar nenhuma página deste capítulo.');
		}

		const status: OfflineStatus = savedCount === urls.length ? 'complete' : 'partial';
		const sizeBytes = pageBlobs.reduce((total, blob) => total + (blob?.size ?? 0), 0);

		const db = await this.initDB();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(['chapters', 'metadata'], 'readwrite');

			const fail = () => {
				const error = transaction.error;
				reject(
					isQuotaError(error)
						? new StorageFullError()
						: (error ?? new Error('Não foi possível salvar o capítulo.'))
				);
			};
			transaction.onerror = fail;
			transaction.onabort = fail;
			transaction.oncomplete = () => resolve();

			const stored: StoredChapter = { id: key, pageBlobs, pageUrls: urls };
			transaction.objectStore('chapters').put(stored);

			const chapterMeta: OfflineChapterMeta = {
				source,
				mangaId,
				chapterId,
				mangaTitle: meta.mangaTitle,
				title: meta.title,
				chapter: meta.chapter,
				pageCount: savedCount,
				totalPages: urls.length,
				status,
				sizeBytes,
				downloadedAt: new Date().toISOString()
			};

			transaction.objectStore('metadata').put({ id: key, ...chapterMeta });
		});

		return status;
	}

	/** Metadados do capitulo salvo, ou undefined se nunca foi baixado. */
	async getChapterStatus(
		source: string,
		mangaId: string,
		chapterId: string
	): Promise<OfflineChapterMeta | undefined> {
		try {
			return await this.get<OfflineChapterMeta>(
				'metadata',
				this.getChapterKey(source, mangaId, chapterId)
			);
		} catch {
			return undefined;
		}
	}

	/**
	 * Só considera baixado o capitulo completo. Um parcial existe no banco mas
	 * nao deve substituir a leitura online quando ha rede.
	 */
	async isChapterDownloaded(source: string, mangaId: string, chapterId: string): Promise<boolean> {
		const meta = await this.getChapterStatus(source, mangaId, chapterId);
		// Registros da v1 nao tinham `status`; tratamos como completos.
		return !!meta && meta.status !== 'partial';
	}

	/** Guarda a lista de capitulos para o leitor poder navegar sem rede. */
	async cacheChapterList(source: string, mangaId: string, chapters: Chapter[]): Promise<void> {
		if (chapters.length === 0) return;
		const db = await this.initDB();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(['chapterLists'], 'readwrite');
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
			transaction.oncomplete = () => resolve();

			const record: StoredChapterList = {
				id: `${source}:::${mangaId}`,
				chapters,
				cachedAt: Date.now()
			};
			transaction.objectStore('chapterLists').put(record);
		});
	}

	/**
	 * Lista em cache. `allowStale` traz mesmo vencida — sem rede, uma lista
	 * antiga e melhor que nenhuma.
	 */
	async getCachedChapterList(
		source: string,
		mangaId: string,
		allowStale = false
	): Promise<Chapter[] | undefined> {
		try {
			const record = await this.get<StoredChapterList>('chapterLists', `${source}:::${mangaId}`);
			if (!record) return undefined;
			if (!allowStale && Date.now() - record.cachedAt > CHAPTER_LIST_TTL_MS) return undefined;
			return record.chapters;
		} catch {
			return undefined;
		}
	}

	/**
	 * Devolve object URLs das paginas salvas. Quem chama e responsavel por
	 * chamar `revokePages` depois, senao os blobs vazam memoria.
	 *
	 * Em um capitulo parcial as paginas que faltam viram string vazia, para o
	 * leitor manter a numeracao certa e mostrar um placeholder no lugar.
	 */
	async getOfflinePages(source: string, mangaId: string, chapterId: string): Promise<string[]> {
		const key = this.getChapterKey(source, mangaId, chapterId);
		const record = await this.get<StoredChapter>('chapters', key);
		const blobs = record?.pageBlobs;
		if (!blobs?.length || !blobs.some(Boolean)) {
			throw new Error('Capítulo offline não encontrado.');
		}
		// `Array.from` e nao `map`: o array de blobs e esparso (as paginas que
		// faltam nunca foram atribuidas) e `map` preserva buracos sem chamar o
		// callback — o leitor recebia `undefined` onde espera a string vazia.
		return Array.from(blobs, (blob) => (blob ? URL.createObjectURL(blob) : ''));
	}

	revokePages(urls: string[]): void {
		for (const url of urls) {
			if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
		}
	}

	async deleteChapter(source: string, mangaId: string, chapterId: string): Promise<void> {
		const db = await this.initDB();
		const key = this.getChapterKey(source, mangaId, chapterId);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['chapters', 'metadata'], 'readwrite');
			transaction.onerror = () => reject(transaction.error);
			// Sem `onabort` um aborto silencioso pendurava o await para sempre.
			transaction.onabort = () =>
				reject(transaction.error ?? new Error('Não foi possível apagar o capítulo.'));
			transaction.oncomplete = () => resolve();

			transaction.objectStore('chapters').delete(key);
			transaction.objectStore('metadata').delete(key);
		});
	}

	async getDownloadedChaptersList(): Promise<OfflineChapterMeta[]> {
		const db = await this.initDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['metadata'], 'readonly');
			const request = transaction.objectStore('metadata').getAll();
			request.onsuccess = () => resolve(request.result ?? []);
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Espaco usado e disponivel, quando o navegador informa.
	 *
	 * `usage`/`quota` do navegador cobrem toda a origem, nao so o Hiraku, e o
	 * Android costuma reportar uma cota bem maior que o disco livre real —
	 * serve para orientar, nao para prometer.
	 */
	async estimateStorage(): Promise<{ usage: number; quota: number } | undefined> {
		if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return undefined;
		try {
			const { usage, quota } = await navigator.storage.estimate();
			if (usage === undefined || quota === undefined) return undefined;
			return { usage, quota };
		} catch {
			return undefined;
		}
	}

	/** Apaga todos os capitulos baixados e as listas em cache. */
	async clearAll(): Promise<void> {
		const db = await this.initDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['chapters', 'metadata', 'chapterLists'], 'readwrite');
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () =>
				reject(transaction.error ?? new Error('Não foi possível limpar os downloads.'));
			transaction.oncomplete = () => resolve();

			transaction.objectStore('chapters').clear();
			transaction.objectStore('metadata').clear();
			transaction.objectStore('chapterLists').clear();
		});
	}
}

export const offlineService = new OfflineService();
