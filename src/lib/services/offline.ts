import { BackendApiService, resolveImageUrl } from './api';

export interface OfflineChapterMeta {
	source: string;
	mangaId: string;
	chapterId: string;
	mangaTitle?: string;
	title?: string;
	chapter?: string;
	pageCount: number;
	sizeBytes: number;
	downloadedAt: string;
}

/** Quantas paginas baixar ao mesmo tempo — equilibra velocidade e carga na fonte. */
const DOWNLOAD_CONCURRENCY = 4;

class OfflineService {
	private dbName = 'hiraku-offline';
	private dbVersion = 1;
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
			};
		});
	}

	private getChapterKey(source: string, mangaId: string, chapterId: string): string {
		return `${source}:::${mangaId}:::${chapterId}`;
	}

	async downloadChapter(
		source: string,
		mangaId: string,
		chapterId: string,
		meta: { title?: string; chapter?: string; mangaTitle?: string },
		onProgress?: (progress: number) => void
	): Promise<void> {
		const db = await this.initDB();

		const pagesInfo = await BackendApiService.getPages(source, chapterId);
		const urls = pagesInfo.page_urls;
		if (urls.length === 0) {
			throw new Error('Este capítulo não tem páginas disponíveis.');
		}

		// Baixa em paralelo mas preserva a ordem das páginas pelo índice.
		const pageBlobs: Blob[] = new Array(urls.length);
		let completed = 0;
		let cursor = 0;

		const worker = async () => {
			while (cursor < urls.length) {
				const index = cursor++;
				const url = resolveImageUrl(urls[index]);
				if (!url) throw new Error(`Página ${index + 1} sem endereço válido.`);

				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`Falha ao baixar a página ${index + 1}.`);
				}
				pageBlobs[index] = await response.blob();
				completed++;
				onProgress?.(Math.round((completed / urls.length) * 100));
			}
		};

		await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, urls.length) }, worker));

		const key = this.getChapterKey(source, mangaId, chapterId);
		const sizeBytes = pageBlobs.reduce((total, blob) => total + blob.size, 0);

		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(['chapters', 'metadata'], 'readwrite');

			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () =>
				reject(transaction.error ?? new Error('Sem espaço para salvar o capítulo.'));
			transaction.oncomplete = () => resolve();

			transaction.objectStore('chapters').put({ id: key, pageBlobs });

			const chapterMeta: OfflineChapterMeta = {
				source,
				mangaId,
				chapterId,
				mangaTitle: meta.mangaTitle,
				title: meta.title,
				chapter: meta.chapter,
				pageCount: pageBlobs.length,
				sizeBytes,
				downloadedAt: new Date().toISOString()
			};

			transaction.objectStore('metadata').put({ id: key, ...chapterMeta });
		});
	}

	async isChapterDownloaded(source: string, mangaId: string, chapterId: string): Promise<boolean> {
		const db = await this.initDB();
		const key = this.getChapterKey(source, mangaId, chapterId);
		return new Promise((resolve) => {
			const transaction = db.transaction(['metadata'], 'readonly');
			const request = transaction.objectStore('metadata').get(key);
			request.onsuccess = () => resolve(!!request.result);
			request.onerror = () => resolve(false);
		});
	}

	/**
	 * Devolve object URLs das paginas salvas. Quem chama e responsavel por
	 * chamar `revokePages` depois, senao os blobs vazam memoria.
	 */
	async getOfflinePages(source: string, mangaId: string, chapterId: string): Promise<string[]> {
		const db = await this.initDB();
		const key = this.getChapterKey(source, mangaId, chapterId);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['chapters'], 'readonly');
			const request = transaction.objectStore('chapters').get(key);
			request.onsuccess = () => {
				const blobs: Blob[] | undefined = request.result?.pageBlobs;
				if (blobs?.length) {
					resolve(blobs.map((blob) => URL.createObjectURL(blob)));
				} else {
					reject(new Error('Capítulo offline não encontrado.'));
				}
			};
			request.onerror = () => reject(request.error);
		});
	}

	revokePages(urls: string[]): void {
		for (const url of urls) {
			if (url.startsWith('blob:')) URL.revokeObjectURL(url);
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

	/** Apaga todos os capitulos baixados. */
	async clearAll(): Promise<void> {
		const db = await this.initDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(['chapters', 'metadata'], 'readwrite');
			transaction.onerror = () => reject(transaction.error);
			transaction.oncomplete = () => resolve();

			transaction.objectStore('chapters').clear();
			transaction.objectStore('metadata').clear();
		});
	}
}

export const offlineService = new OfflineService();
