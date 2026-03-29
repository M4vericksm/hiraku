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

	clearAll() {
		this.library = [];
		localStorage.removeItem('hiraku-library');
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
