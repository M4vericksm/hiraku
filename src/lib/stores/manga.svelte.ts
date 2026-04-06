import { PersistenceService } from '../services/persistence';

export interface PDFBookmark {
	title: string;
	pageNumber: number;
}

export interface Manga {
	id: string;
	title: string;
	author?: string;
	coverUrl?: string;
	description?: string;
	progress: number; // 0 a 100
	lastReadPage: number;
	totalPage: number;
	filePath: string;
	addedAt: string;
	lastReadAt?: string;
	bookmarks: PDFBookmark[];
	hasHandle?: boolean;
	genres?: string[];
	status?: string;
	averageScore?: number;
}

class MangaStore {
	library = $state<Manga[]>([]);
	isLoading = $state(true);

	constructor() {
		if (typeof window === 'undefined') return;

		const saved = localStorage.getItem('hiraku-library');
		if (saved) {
			try {
				this.library = JSON.parse(saved);
			} catch (e) {
				console.error('Falha ao processar biblioteca', e);
			}
		}
		this.isLoading = false;
	}

	saveToStorage() {
		if (typeof window === 'undefined') return;
		localStorage.setItem('hiraku-library', JSON.stringify(this.library));
	}

	async addManga(manga: Manga, handle?: FileSystemFileHandle) {
		if (handle) {
			await PersistenceService.saveHandle(manga.id, handle);
			manga.hasHandle = true;
		}
		this.library = [manga, ...this.library];
		this.saveToStorage();
	}

	async addMangas(mangas: { manga: Manga; handle?: FileSystemFileHandle }[]) {
		for (const item of mangas) {
			if (item.handle) {
				await PersistenceService.saveHandle(item.manga.id, item.handle);
				item.manga.hasHandle = true;
			}
		}
		this.library = [...mangas.map(m => m.manga), ...this.library];
		this.saveToStorage();
	}

	updateProgress(id: string, page: number, total: number) {
		const index = this.library.findIndex((m) => m.id === id);
		if (index !== -1) {
			const manga = this.library[index];
			this.library[index] = {
				...manga,
				lastReadPage: page,
				totalPage: total,
				progress: Math.round((page / total) * 100),
				lastReadAt: new Date().toISOString()
			};
			this.saveToStorage();
		}
	}

	async removeManga(id: string) {
		await PersistenceService.removeHandle(id);
		this.library = this.library.filter((m) => m.id !== id);
		this.saveToStorage();
	}

	markHasHandle(id: string) {
		const idx = this.library.findIndex(m => m.id === id);
		if (idx !== -1) {
			this.library[idx] = { ...this.library[idx], hasHandle: true };
			this.saveToStorage();
		}
	}

	updateMeta(id: string, meta: Partial<Manga>) {
		const idx = this.library.findIndex(m => m.id === id);
		if (idx !== -1) {
			this.library[idx] = { ...this.library[idx], ...meta };
			this.saveToStorage();
		}
	}

	clearAll() {
		this.library = [];
		localStorage.removeItem('hiraku-library');
	}

	exportLibrary(): string {
		return JSON.stringify(
			{
				version: '1',
				exportedAt: new Date().toISOString(),
				library: this.library,
			},
			null,
			2
		);
	}

	importLibrary(json: string): { ok: boolean; count: number; error?: string } {
		try {
			const data = JSON.parse(json);
			if (!data.version || !Array.isArray(data.library)) {
				return { ok: false, count: 0, error: 'Arquivo inválido ou não é um backup do Hiraku.' };
			}
			const incoming: Manga[] = data.library;
			const existingIds = new Set(this.library.map((m) => m.id));
			const newEntries = incoming.filter((m) => !existingIds.has(m.id));
			this.library = [...newEntries.map((m) => ({ ...m, hasHandle: false })), ...this.library];
			this.saveToStorage();
			return { ok: true, count: newEntries.length };
		} catch {
			return { ok: false, count: 0, error: 'Não foi possível ler o arquivo de backup.' };
		}
	}

	get recentManga() {
		return [...this.library]
			.filter((m) => m.lastReadAt || m.lastReadPage > 1)
			.sort((a, b) => {
				const dateA = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
				const dateB = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
				return dateB - dateA;
			})
			.slice(0, 4);
	}
}

export const mangaStore = new MangaStore();
