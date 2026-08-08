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
	/**
	 * Pastas as quais o manga pertence. Como no Mihon, a relacao e N:N — o mesmo
	 * titulo pode estar em "Lendo" e "Favoritos" ao mesmo tempo. Guardamos os ids
	 * no manga (e nao a lista de mangas na pasta) para que remover um titulo da
	 * biblioteca ja apague as associacoes junto, sem varrer as pastas.
	 */
	folderIds?: string[];
}

/** Pasta/categoria criada pelo usuario para organizar a biblioteca. */
export interface Folder {
	id: string;
	name: string;
	createdAt: string;
}

/**
 * Formato atual do localStorage. A v1 gravava apenas o array de mangas na raiz;
 * o envelope existe para caber a lista de pastas no mesmo registro, mantendo
 * biblioteca e pastas sempre consistentes entre si (uma so escrita, um so read).
 */
interface PersistedLibrary {
	version: number;
	library: Manga[];
	folders: Folder[];
}

const SCHEMA_VERSION = 2;

function newId(): string {
	// randomUUID so existe em contexto seguro; o fallback evita quebrar em http://.
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeName(name: string): string {
	return name.trim().replace(/\s+/g, ' ');
}

class MangaStore {
	library = $state<Manga[]>([]);
	folders = $state<Folder[]>([]);
	isLoading = $state(true);

	constructor() {
		if (typeof window === 'undefined') {
			this.isLoading = false;
			return;
		}
		this.loadFromStorage();
		this.isLoading = false;
	}

	/**
	 * Le o localStorage e repovoa o store. Publica (e nao so chamada no construtor)
	 * porque a instancia e unica: sem isso nao ha como reexercitar a leitura —
	 * nos testes, ou se outra aba reescrever a biblioteca.
	 */
	loadFromStorage() {
		if (typeof window === 'undefined') return;
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) {
			this.library = [];
			this.folders = [];
			return;
		}
		try {
			this.hydrate(JSON.parse(saved));
		} catch (e) {
			console.error('Falha ao processar biblioteca', e);
			// Um JSON quebrado nao pode deixar o store num meio-termo: zeramos para
			// que a UI mostre "biblioteca vazia" em vez de dados pela metade.
			this.library = [];
			this.folders = [];
		}
	}

	/**
	 * Aceita tanto o formato antigo (array puro de mangas) quanto o envelope novo.
	 * Nada aqui pode lancar: um localStorage adulterado ou de uma versao futura
	 * nao deve impedir o app de abrir — no pior caso a biblioteca vem vazia.
	 */
	private hydrate(raw: unknown) {
		let mangas: unknown[] = [];
		let folders: unknown[] = [];

		if (Array.isArray(raw)) {
			// v1: apenas a lista de mangas, sem pastas.
			mangas = raw;
		} else if (raw && typeof raw === 'object') {
			const envelope = raw as Partial<PersistedLibrary>;
			if (Array.isArray(envelope.library)) mangas = envelope.library;
			if (Array.isArray(envelope.folders)) folders = envelope.folders;
		}

		this.folders = folders.filter(
			(f): f is Folder =>
				!!f &&
				typeof f === 'object' &&
				typeof (f as Folder).id === 'string' &&
				typeof (f as Folder).name === 'string'
		);
		const knownFolderIds = new Set(this.folders.map((f) => f.id));

		this.library = mangas
			.filter(
				(m): m is Manga => !!m && typeof m === 'object' && typeof (m as Manga).id === 'string'
			)
			.map((m) => ({
				...m,
				// Mangas gravados antes das pastas nao tem folderIds; e ids orfaos
				// (pasta excluida por outra aba, JSON editado a mao) sao descartados
				// para a UI nunca mostrar contagem de uma pasta que nao existe.
				folderIds: Array.isArray(m.folderIds)
					? m.folderIds.filter((id) => typeof id === 'string' && knownFolderIds.has(id))
					: []
			}));
	}

	saveToStorage() {
		if (typeof window === 'undefined') return;
		try {
			const payload: PersistedLibrary = {
				version: SCHEMA_VERSION,
				library: this.library,
				folders: this.folders
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
			const existing = this.library[existingIndex];
			// Re-adicionar um manga (ex.: vindo do catalogo, com metadados frescos)
			// nao pode zerar a organizacao do usuario: as pastas do objeto novo so
			// valem se ele realmente trouxer alguma.
			this.library[existingIndex] = {
				...existing,
				...manga,
				folderIds: manga.folderIds ?? existing.folderIds ?? []
			};
		} else {
			this.library = [{ ...manga, folderIds: manga.folderIds ?? [] }, ...this.library];
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
		if (idx !== -1) {
			this.library[idx] = { ...this.library[idx], ...meta };
			this.saveToStorage();
		}
	}

	clearAll() {
		this.library = [];
		this.folders = [];
		if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
	}

	// ---------------------------------------------------------------------------
	// Pastas (categorias)
	// ---------------------------------------------------------------------------

	/**
	 * Cria uma pasta e devolve ela. Nomes sao unicos sem diferenciar maiusculas:
	 * duas pastas "Terror" e "terror" seriam indistinguiveis nas abas, entao
	 * reaproveitamos a existente em vez de criar uma duplicata invisivel.
	 * Devolve null se o nome for vazio.
	 */
	createFolder(name: string): Folder | null {
		const clean = normalizeName(name);
		if (!clean) return null;

		const existing = this.findFolderByName(clean);
		if (existing) return existing;

		const folder: Folder = { id: newId(), name: clean, createdAt: new Date().toISOString() };
		this.folders = [...this.folders, folder];
		this.saveToStorage();
		return folder;
	}

	findFolder(folderId: string): Folder | undefined {
		return this.folders.find((f) => f.id === folderId);
	}

	findFolderByName(name: string): Folder | undefined {
		const clean = normalizeName(name).toLowerCase();
		return this.folders.find((f) => f.name.toLowerCase() === clean);
	}

	/** Renomeia a pasta. Retorna false se o id nao existe ou o nome e invalido/duplicado. */
	renameFolder(folderId: string, name: string): boolean {
		const clean = normalizeName(name);
		if (!clean) return false;

		const index = this.folders.findIndex((f) => f.id === folderId);
		if (index === -1) return false;

		const clash = this.findFolderByName(clean);
		if (clash && clash.id !== folderId) return false;

		this.folders[index] = { ...this.folders[index], name: clean };
		this.saveToStorage();
		return true;
	}

	/**
	 * Exclui a pasta. Os mangas NAO sao removidos da biblioteca — a pasta e so um
	 * rotulo, entao apagamos apenas a associacao de quem estava nela.
	 */
	deleteFolder(folderId: string) {
		if (!this.findFolder(folderId)) return;

		this.folders = this.folders.filter((f) => f.id !== folderId);
		this.library = this.library.map((m) =>
			m.folderIds?.includes(folderId)
				? { ...m, folderIds: m.folderIds.filter((id) => id !== folderId) }
				: m
		);
		this.saveToStorage();
	}

	/** Adiciona o manga a uma pasta (idempotente). */
	addMangaToFolder(id: string, source: string, folderId: string) {
		const index = this.indexOf(id, source);
		if (index === -1 || !this.findFolder(folderId)) return;

		const manga = this.library[index];
		const current = manga.folderIds ?? [];
		if (current.includes(folderId)) return;

		this.library[index] = { ...manga, folderIds: [...current, folderId] };
		this.saveToStorage();
	}

	removeMangaFromFolder(id: string, source: string, folderId: string) {
		const index = this.indexOf(id, source);
		if (index === -1) return;

		const manga = this.library[index];
		const current = manga.folderIds ?? [];
		if (!current.includes(folderId)) return;

		this.library[index] = { ...manga, folderIds: current.filter((f) => f !== folderId) };
		this.saveToStorage();
	}

	/** Alterna a presenca do manga na pasta — o que a UI de checkbox precisa. */
	toggleMangaFolder(id: string, source: string, folderId: string) {
		if (this.isMangaInFolder(id, source, folderId)) {
			this.removeMangaFromFolder(id, source, folderId);
		} else {
			this.addMangaToFolder(id, source, folderId);
		}
	}

	isMangaInFolder(id: string, source: string, folderId: string): boolean {
		return this.find(id, source)?.folderIds?.includes(folderId) ?? false;
	}

	mangasInFolder(folderId: string): Manga[] {
		return this.library.filter((m) => m.folderIds?.includes(folderId));
	}

	folderCount(folderId: string): number {
		return this.mangasInFolder(folderId).length;
	}

	/** Pastas do manga, na ordem em que aparecem na faixa de abas. */
	foldersOf(id: string, source: string): Folder[] {
		const ids = this.find(id, source)?.folderIds ?? [];
		return this.folders.filter((f) => ids.includes(f.id));
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
