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

interface StoredChapter {
	id: string;
	/** Esparso enquanto parcial: indices sem pagina ficam vazios. */
	pageBlobs: (Blob | undefined)[];
}

interface StoredChapterList {
	id: string;
	chapters: Chapter[];
	cachedAt: number;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

class OfflineService {
	private dbName = 'hiraku-offline';
	private dbVersion = 2;
	private db: IDBDatabase | null = null;

	private initDB(): Promise<IDBDatabase> {
		if (this.db) return Promise.resolve(this.db);
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.dbVersion);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve(request.result);
			};

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
		if (existing?.pageBlobs?.length === urls.length) {
			for (let i = 0; i < urls.length; i++) pageBlobs[i] = existing.pageBlobs[i];
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

			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () =>
				reject(transaction.error ?? new Error('Sem espaço para salvar o capítulo.'));
			transaction.oncomplete = () => resolve();

			const stored: StoredChapter = { id: key, pageBlobs };
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
		return blobs.map((blob) => (blob ? URL.createObjectURL(blob) : ''));
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

	/** Apaga todos os capitulos baixados e as listas em cache. */
	async clearAll(): Promise<void> {
		const db = await this.initDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['chapters', 'metadata', 'chapterLists'], 'readwrite');
			transaction.onerror = () => reject(transaction.error);
			transaction.oncomplete = () => resolve();

			transaction.objectStore('chapters').clear();
			transaction.objectStore('metadata').clear();
			transaction.objectStore('chapterLists').clear();
		});
	}
}

export const offlineService = new OfflineService();
