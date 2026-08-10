import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

/**
 * `offline.ts` conversa com o backend por `fetchImageBlob`/`getPages`. Aqui
 * essas duas pontas viram mocks controlaveis: cada teste decide quantas
 * paginas o capitulo tem e quais delas falham.
 */
const pageUrlsBySource = new Map<string, string[]>();
const failingUrls = new Set<string>();
let fetchedUrls: string[] = [];

vi.mock('./api', async () => {
	const actual = await vi.importActual<typeof import('./api')>('./api');
	return {
		...actual,
		resolveImageUrl: (url: string) => url,
		isAborted: (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
		fetchImageBlob: async (url: string, signal?: AbortSignal) => {
			if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
			fetchedUrls.push(url);
			if (failingUrls.has(url)) throw new Error(`falha proposital em ${url}`);
			return new Blob(['x'.repeat(10)], { type: 'image/jpeg' });
		},
		BackendApiService: {
			...actual.BackendApiService,
			getPages: async (source: string, chapterId: string) => ({
				page_urls: pageUrlsBySource.get(`${source}:${chapterId}`) ?? []
			})
		}
	};
});

const { offlineService, StorageFullError } = await import('./offline');

function setPages(source: string, chapterId: string, urls: string[]) {
	pageUrlsBySource.set(`${source}:${chapterId}`, urls);
}

// jsdom nao implementa object URLs; o suficiente para checar formato e revogacao.
let objectUrlSeq = 0;
const liveObjectUrls = new Set<string>();
URL.createObjectURL = () => {
	const url = `blob:hiraku/${++objectUrlSeq}`;
	liveObjectUrls.add(url);
	return url;
};
URL.revokeObjectURL = (url: string) => {
	liveObjectUrls.delete(url);
};

beforeEach(() => {
	// Banco novo por teste: o estado do IndexedDB nao pode vazar entre casos.
	// `globalThis` e nao atribuicao direta: o eslint barra reatribuir um global
	// read-only, e trocar a fabrica so faz sentido em teste.
	globalThis.indexedDB = new IDBFactory();
	liveObjectUrls.clear();
	// A conexao memoizada aponta para o banco antigo — descarta.
	(offlineService as unknown as { db: IDBDatabase | null; opening: Promise<unknown> | null }).db =
		null;
	(offlineService as unknown as { opening: Promise<unknown> | null }).opening = null;

	pageUrlsBySource.clear();
	failingUrls.clear();
	fetchedUrls = [];
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('downloadChapter', () => {
	it('salva todas as paginas e marca como completo', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg', 'c.jpg']);

		const status = await offlineService.downloadChapter('src', 'm1', 'c1', {});

		expect(status).toBe('complete');
		const meta = await offlineService.getChapterStatus('src', 'm1', 'c1');
		expect(meta?.pageCount).toBe(3);
		expect(meta?.totalPages).toBe(3);
	});

	it('guarda o que veio quando uma pagina falha, em vez de perder o capitulo', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg', 'c.jpg']);
		failingUrls.add('b.jpg');

		const status = await offlineService.downloadChapter('src', 'm1', 'c1', {});

		expect(status).toBe('partial');
		const meta = await offlineService.getChapterStatus('src', 'm1', 'c1');
		expect(meta?.pageCount).toBe(2);
		expect(meta?.totalPages).toBe(3);
	});

	it('so um parcial nao conta como baixado', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg']);
		failingUrls.add('b.jpg');
		await offlineService.downloadChapter('src', 'm1', 'c1', {});

		expect(await offlineService.isChapterDownloaded('src', 'm1', 'c1')).toBe(false);
	});

	it('estoura se nenhuma pagina vier', async () => {
		setPages('src', 'c1', ['a.jpg']);
		failingUrls.add('a.jpg');

		await expect(offlineService.downloadChapter('src', 'm1', 'c1', {})).rejects.toThrow(
			/nenhuma página/i
		);
	});

	it('reporta progresso ate 100 no caminho feliz', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg']);
		const seen: number[] = [];

		await offlineService.downloadChapter('src', 'm1', 'c1', {}, (p) => seen.push(p));

		expect(seen.at(-1)).toBe(100);
	});
});

describe('retomada de download parcial', () => {
	it('nao rebaixa o que ja esta salvo', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg', 'c.jpg']);
		failingUrls.add('c.jpg');
		await offlineService.downloadChapter('src', 'm1', 'c1', {});

		failingUrls.clear();
		fetchedUrls = [];
		const status = await offlineService.downloadChapter('src', 'm1', 'c1', {});

		expect(status).toBe('complete');
		// Apenas a pagina que faltava foi buscada de novo.
		expect(fetchedUrls).toEqual(['c.jpg']);
	});

	it('aproveita as paginas que sobreviveram quando a fonte insere uma no meio', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg']);
		await offlineService.downloadChapter('src', 'm1', 'c1', {});

		// A scan insere um aviso no comeco: tudo anda uma posicao.
		setPages('src', 'c1', ['aviso.jpg', 'a.jpg', 'b.jpg']);
		fetchedUrls = [];
		const status = await offlineService.downloadChapter('src', 'm1', 'c1', {});

		expect(status).toBe('complete');
		// Casar por URL evita rebaixar a.jpg e b.jpg so porque o indice mudou.
		expect(fetchedUrls).toEqual(['aviso.jpg']);
	});
});

describe('cancelamento', () => {
	it('um signal ja abortado nao grava capitulo nenhum', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg']);

		await expect(
			offlineService.downloadChapter('src', 'm1', 'c1', {}, undefined, AbortSignal.abort())
		).rejects.toThrow();

		expect(await offlineService.getChapterStatus('src', 'm1', 'c1')).toBeUndefined();
	});
});

describe('getOfflinePages', () => {
	it('devolve uma url por pagina salva', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg']);
		await offlineService.downloadChapter('src', 'm1', 'c1', {});

		const pages = await offlineService.getOfflinePages('src', 'm1', 'c1');

		expect(pages).toHaveLength(2);
		expect(pages.every((p) => p.startsWith('blob:'))).toBe(true);
		offlineService.revokePages(pages);
	});

	it('mantem a numeracao do parcial com string vazia no buraco', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg', 'c.jpg']);
		failingUrls.add('b.jpg');
		await offlineService.downloadChapter('src', 'm1', 'c1', {});

		const pages = await offlineService.getOfflinePages('src', 'm1', 'c1');

		// O leitor conta com o comprimento total para numerar as paginas certo.
		expect(pages).toHaveLength(3);
		expect(pages[1]).toBe('');
		offlineService.revokePages(pages);
	});

	it('estoura para capitulo que nunca foi baixado', async () => {
		await expect(offlineService.getOfflinePages('src', 'm1', 'fantasma')).rejects.toThrow();
	});

	it('revokePages solta todos os blobs — o leitor vaza memoria se esquecer', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg']);
		await offlineService.downloadChapter('src', 'm1', 'c1', {});
		const pages = await offlineService.getOfflinePages('src', 'm1', 'c1');
		expect(liveObjectUrls.size).toBe(2);

		offlineService.revokePages(pages);

		expect(liveObjectUrls.size).toBe(0);
	});

	it('revokePages ignora os buracos do parcial sem estourar', async () => {
		setPages('src', 'c1', ['a.jpg', 'b.jpg']);
		failingUrls.add('a.jpg');
		await offlineService.downloadChapter('src', 'm1', 'c1', {});
		const pages = await offlineService.getOfflinePages('src', 'm1', 'c1');

		expect(() => offlineService.revokePages(pages)).not.toThrow();
		expect(liveObjectUrls.size).toBe(0);
	});
});

describe('deleteChapter e clearAll', () => {
	it('apaga um capitulo sem tocar nos outros', async () => {
		setPages('src', 'c1', ['a.jpg']);
		setPages('src', 'c2', ['b.jpg']);
		await offlineService.downloadChapter('src', 'm1', 'c1', {});
		await offlineService.downloadChapter('src', 'm1', 'c2', {});

		await offlineService.deleteChapter('src', 'm1', 'c1');

		expect(await offlineService.getChapterStatus('src', 'm1', 'c1')).toBeUndefined();
		expect(await offlineService.getChapterStatus('src', 'm1', 'c2')).toBeDefined();
	});

	it('clearAll esvazia a lista de baixados', async () => {
		setPages('src', 'c1', ['a.jpg']);
		await offlineService.downloadChapter('src', 'm1', 'c1', {});
		expect(await offlineService.getDownloadedChaptersList()).toHaveLength(1);

		await offlineService.clearAll();

		expect(await offlineService.getDownloadedChaptersList()).toEqual([]);
	});
});

describe('cache da lista de capitulos', () => {
	const chapters = [{ source_id: 'c1', title: 'Cap 1' }] as never;

	it('devolve a lista gravada', async () => {
		await offlineService.cacheChapterList('src', 'm1', chapters);

		expect(await offlineService.getCachedChapterList('src', 'm1')).toHaveLength(1);
	});

	it('esconde a lista vencida, mas entrega com allowStale', async () => {
		await offlineService.cacheChapterList('src', 'm1', chapters);

		// 25h depois: passou do TTL de 24h.
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);

		expect(await offlineService.getCachedChapterList('src', 'm1')).toBeUndefined();
		// Sem rede, uma lista velha vale mais que nenhuma.
		expect(await offlineService.getCachedChapterList('src', 'm1', true)).toHaveLength(1);
	});
});

describe('StorageFullError', () => {
	it('a mensagem diz o que fazer, nao so que falhou', () => {
		expect(new StorageFullError().message).toMatch(/apague/i);
	});
});
