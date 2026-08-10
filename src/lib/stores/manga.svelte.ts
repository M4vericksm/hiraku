const STORAGE_KEY = 'hiraku-library';

export interface Manga {
	id: string; // source_manga_id
	source: string; // mangadex, mangalivre, ...
	title: string;
	author?: string;
	coverUrl?: string;
	description?: string;
	/** Progresso dentro do capitulo atual, em porcentagem. */
	progress: number;
	lastReadPage: number;
	totalPage: number;
	/** Capitulo em leitura, para o botao "continuar lendo" retomar no lugar certo. */
	lastChapterId?: string;
	lastChapterLabel?: string;
	/** Capitulos ja concluidos, usados para marcar a lista de capitulos. */
	readChapterIds?: string[];
	addedAt: string;
	lastReadAt?: string;
	genres?: string[];
	status?: string;
	averageScore?: number;
}

class MangaStore {
	library = $state<Manga[]>([]);
	isLoading = $state(true);

	constructor() {
		if (typeof window === 'undefined') {
			this.isLoading = false;
			return;
		}
		const saved = localStorage.getItem(STORAGE_KEY);
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
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.library));
		} catch (e: unknown) {
			console.error('Falha ao salvar biblioteca', e);
		}
	}

	private indexOf(id: string, source: string): number {
		return this.library.findIndex((m) => m.id === id && m.source === source);
	}

	find(id: string, source: string): Manga | undefined {
		return this.library.find((m) => m.id === id && m.source === source);
	}

	addManga(manga: Manga) {
		const existingIndex = this.indexOf(manga.id, manga.source);
		if (existingIndex >= 0) {
			this.library[existingIndex] = { ...this.library[existingIndex], ...manga };
		} else {
			this.library = [manga, ...this.library];
		}
		this.saveToStorage();
	}

	/**
	 * Atualiza a posicao de leitura. Só mexe em mangás que estão na biblioteca —
	 * ler algo do catálogo não deve adicioná-lo automaticamente.
	 */
	updateProgress(
		id: string,
		source: string,
		page: number,
		total: number,
		chapter?: { id: string; label?: string }
	) {
		const index = this.indexOf(id, source);
		if (index === -1) return;

		const manga = this.library[index];
		// Chamada repetida com a mesma posicao nao deve trocar o objeto no array:
		// cada troca recomputa os deriveds que apontam para ele.
		if (
			manga.lastReadPage === page &&
			manga.totalPage === total &&
			(chapter?.id === undefined || manga.lastChapterId === chapter.id) &&
			(chapter?.label === undefined || manga.lastChapterLabel === chapter.label)
		) {
			return;
		}
		this.library[index] = {
			...manga,
			lastReadPage: page,
			totalPage: total,
			progress: total > 0 ? Math.round((page / total) * 100) : 0,
			lastChapterId: chapter?.id ?? manga.lastChapterId,
			lastChapterLabel: chapter?.label ?? manga.lastChapterLabel,
			lastReadAt: new Date().toISOString()
		};
		this.saveToStorage();
	}

	/** Marca um capitulo como lido (idempotente). */
	markChapterRead(id: string, source: string, chapterId: string) {
		const index = this.indexOf(id, source);
		if (index === -1) return;

		const manga = this.library[index];
		const read = manga.readChapterIds ?? [];
		if (read.includes(chapterId)) return;

		this.library[index] = { ...manga, readChapterIds: [...read, chapterId] };
		this.saveToStorage();
	}

	isChapterRead(id: string, source: string, chapterId: string): boolean {
		return this.find(id, source)?.readChapterIds?.includes(chapterId) ?? false;
	}

	removeManga(id: string, source: string) {
		this.library = this.library.filter((m) => !(m.id === id && m.source === source));
		this.saveToStorage();
	}

	updateMeta(id: string, source: string, meta: Partial<Manga>) {
		const idx = this.indexOf(id, source);
		if (idx === -1) return;

		// Escrever sem mudanca real troca o objeto no array e reroda qualquer
		// effect que dependa dele — com um effect que chama updateMeta, isso
		// vira loop infinito. No-op quando os valores ja sao os atuais.
		const current = this.library[idx];
		const changed = (Object.keys(meta) as (keyof Manga)[]).some(
			(key) => current[key] !== meta[key]
		);
		if (!changed) return;

		this.library[idx] = { ...this.library[idx], ...meta };
		this.saveToStorage();
	}

	clearAll() {
		this.library = [];
		if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
	}

	get recentManga(): Manga[] {
		return [...this.library]
			.filter((m) => m.lastReadAt || m.lastReadPage > 1)
			.sort((a, b) => {
				const dA = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
				const dB = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
				return dB - dA;
			})
			.slice(0, 4);
	}
}

export const mangaStore = new MangaStore();
