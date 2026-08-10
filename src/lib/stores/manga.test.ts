import { describe, it, expect, beforeEach } from 'vitest';
import { mangaStore, type Manga } from './manga.svelte';

function makeManga(overrides: Partial<Manga> = {}): Manga {
	return {
		id: crypto.randomUUID(),
		source: 'mangadex',
		title: 'Test Manga',
		progress: 0,
		lastReadPage: 0,
		totalPage: 100,
		addedAt: new Date().toISOString(),
		...overrides
	};
}

beforeEach(() => {
	mangaStore.clearAll();
});

describe('MangaStore.addManga', () => {
	it('adds a manga to the library', () => {
		const manga = makeManga({ title: 'Berserk' });
		mangaStore.addManga(manga);
		expect(mangaStore.library).toHaveLength(1);
		expect(mangaStore.library[0].title).toBe('Berserk');
	});

	it('prepends new manga to the library', () => {
		const first = makeManga({ title: 'First' });
		const second = makeManga({ title: 'Second' });
		mangaStore.addManga(first);
		mangaStore.addManga(second);
		expect(mangaStore.library[0].title).toBe('Second');
		expect(mangaStore.library[1].title).toBe('First');
	});

	it('guarda a capa sem o host do backend', () => {
		mangaStore.addManga(
			makeManga({
				id: 'cap',
				source: 'src',
				coverUrl: 'http://localhost:8000/image?url=https%3A%2F%2Fx.to%2Fa.webp'
			})
		);
		expect(mangaStore.find('cap', 'src')?.coverUrl).toBe('/image?url=https%3A%2F%2Fx.to%2Fa.webp');
	});

	it('persists library to localStorage', () => {
		const manga = makeManga({ title: 'Naruto' });
		mangaStore.addManga(manga);
		const stored = JSON.parse(localStorage.getItem('hiraku-library') ?? '{}') as {
			library: Manga[];
		};
		expect(stored.library.some((m) => m.title === 'Naruto')).toBe(true);
	});
});

describe('MangaStore.updateProgress', () => {
	it('calculates progress percentage correctly', () => {
		const manga = makeManga({ id: 'abc', source: 'src', totalPage: 200 });
		mangaStore.addManga(manga);
		mangaStore.updateProgress('abc', 'src', 50, 200);
		const updated = mangaStore.library.find((m) => m.id === 'abc' && m.source === 'src');
		expect(updated?.progress).toBe(25);
		expect(updated?.lastReadPage).toBe(50);
	});

	it('sets progress to 100 on last page', () => {
		const manga = makeManga({ id: 'xyz', source: 'src', totalPage: 100 });
		mangaStore.addManga(manga);
		mangaStore.updateProgress('xyz', 'src', 100, 100);
		const updated = mangaStore.library.find((m) => m.id === 'xyz' && m.source === 'src');
		expect(updated?.progress).toBe(100);
	});

	it('sets lastReadAt timestamp', () => {
		const manga = makeManga({ id: 'ts', source: 'src' });
		mangaStore.addManga(manga);
		const before = Date.now();
		mangaStore.updateProgress('ts', 'src', 10, 100);
		const updated = mangaStore.library.find((m) => m.id === 'ts' && m.source === 'src');
		const after = Date.now();
		const lastRead = new Date(updated!.lastReadAt!).getTime();
		expect(lastRead).toBeGreaterThanOrEqual(before);
		expect(lastRead).toBeLessThanOrEqual(after);
	});

	it('does nothing when id not found', () => {
		expect(() => mangaStore.updateProgress('nonexistent', 'src', 5, 10)).not.toThrow();
	});

	it('does not add mangas that are not in the library', () => {
		mangaStore.updateProgress('from-catalog', 'src', 5, 10);
		expect(mangaStore.library).toHaveLength(0);
	});

	it('records the chapter being read so reading can resume there', () => {
		mangaStore.addManga(makeManga({ id: 'ch', source: 'src' }));
		mangaStore.updateProgress('ch', 'src', 3, 20, { id: 'chapter-7', label: 'Cap. 7' });
		const updated = mangaStore.find('ch', 'src');
		expect(updated?.lastChapterId).toBe('chapter-7');
		expect(updated?.lastChapterLabel).toBe('Cap. 7');
	});

	it('keeps the known chapter when a later update omits it', () => {
		mangaStore.addManga(makeManga({ id: 'keep', source: 'src' }));
		mangaStore.updateProgress('keep', 'src', 1, 20, { id: 'chapter-1' });
		mangaStore.updateProgress('keep', 'src', 2, 20);
		expect(mangaStore.find('keep', 'src')?.lastChapterId).toBe('chapter-1');
	});

	it('does not divide by zero when the chapter has no pages', () => {
		mangaStore.addManga(makeManga({ id: 'empty', source: 'src' }));
		mangaStore.updateProgress('empty', 'src', 0, 0);
		expect(mangaStore.find('empty', 'src')?.progress).toBe(0);
	});
});

describe('MangaStore chapter read state', () => {
	it('marks a chapter as read', () => {
		mangaStore.addManga(makeManga({ id: 'r', source: 'src' }));
		mangaStore.markChapterRead('r', 'src', 'c1');
		expect(mangaStore.isChapterRead('r', 'src', 'c1')).toBe(true);
	});

	it('does not duplicate a chapter marked twice', () => {
		mangaStore.addManga(makeManga({ id: 'dup', source: 'src' }));
		mangaStore.markChapterRead('dup', 'src', 'c1');
		mangaStore.markChapterRead('dup', 'src', 'c1');
		expect(mangaStore.find('dup', 'src')?.readChapterIds).toEqual(['c1']);
	});

	it('reports unread chapters as not read', () => {
		mangaStore.addManga(makeManga({ id: 'u', source: 'src' }));
		expect(mangaStore.isChapterRead('u', 'src', 'c9')).toBe(false);
	});

	it('is safe for mangas outside the library', () => {
		expect(() => mangaStore.markChapterRead('ghost', 'src', 'c1')).not.toThrow();
		expect(mangaStore.isChapterRead('ghost', 'src', 'c1')).toBe(false);
	});
});

describe('MangaStore.removeManga', () => {
	it('removes manga by id and source', () => {
		const manga = makeManga({ id: 'del', source: 'src' });
		mangaStore.addManga(manga);
		expect(mangaStore.library).toHaveLength(1);
		mangaStore.removeManga('del', 'src');
		expect(mangaStore.library).toHaveLength(0);
	});

	it('does not affect other entries', () => {
		const a = makeManga({ id: 'a', source: 'src1', title: 'A' });
		const b = makeManga({ id: 'b', source: 'src2', title: 'B' });
		mangaStore.addManga(a);
		mangaStore.addManga(b);
		mangaStore.removeManga('a', 'src1');
		expect(mangaStore.library).toHaveLength(1);
		expect(mangaStore.library[0].title).toBe('B');
	});
});

describe('MangaStore.recentManga', () => {
	it('returns only mangas with activity', () => {
		const unread = makeManga({ id: 'u', source: 's', lastReadPage: 0 });
		const read = makeManga({
			id: 'r',
			source: 's',
			lastReadPage: 5,
			lastReadAt: new Date().toISOString()
		});
		mangaStore.addManga(unread);
		mangaStore.addManga(read);
		expect(mangaStore.recentManga.every((m) => m.id !== 'u')).toBe(true);
		expect(mangaStore.recentManga.some((m) => m.id === 'r')).toBe(true);
	});

	it('returns at most 4 items', () => {
		for (let i = 0; i < 6; i++) {
			mangaStore.addManga(
				makeManga({
					id: `m${i}`,
					source: 's',
					lastReadPage: 10,
					lastReadAt: new Date(Date.now() - i * 1000).toISOString()
				})
			);
		}
		expect(mangaStore.recentManga.length).toBeLessThanOrEqual(4);
	});

	it('is sorted by lastReadAt descending', () => {
		const older = makeManga({
			id: 'old',
			source: 's',
			lastReadPage: 1,
			lastReadAt: new Date('2026-01-01').toISOString()
		});
		const newer = makeManga({
			id: 'new',
			source: 's',
			lastReadPage: 1,
			lastReadAt: new Date('2026-03-01').toISOString()
		});
		mangaStore.addManga(older);
		mangaStore.addManga(newer);
		expect(mangaStore.recentManga[0].id).toBe('new');
	});
});

describe('MangaStore.clearAll', () => {
	it('empties the library', () => {
		mangaStore.addManga(makeManga());
		mangaStore.clearAll();
		expect(mangaStore.library).toHaveLength(0);
	});

	it('removes localStorage entry', () => {
		mangaStore.addManga(makeManga());
		mangaStore.clearAll();
		expect(localStorage.getItem('hiraku-library')).toBeNull();
	});

	it('empties the folders too', () => {
		mangaStore.createFolder('Terror');
		mangaStore.clearAll();
		expect(mangaStore.folders).toHaveLength(0);
	});
});

describe('MangaStore folder CRUD', () => {
	it('creates a folder with an id and a name', () => {
		const folder = mangaStore.createFolder('Lendo');
		expect(folder).not.toBeNull();
		expect(folder!.name).toBe('Lendo');
		expect(folder!.id).toBeTruthy();
		expect(mangaStore.folders).toHaveLength(1);
	});

	it('trims and collapses whitespace in the name', () => {
		const folder = mangaStore.createFolder('  Terror   psicológico  ');
		expect(folder!.name).toBe('Terror psicológico');
	});

	it('refuses empty or whitespace-only names', () => {
		expect(mangaStore.createFolder('')).toBeNull();
		expect(mangaStore.createFolder('   ')).toBeNull();
		expect(mangaStore.folders).toHaveLength(0);
	});

	it('reuses an existing folder instead of creating a case-insensitive duplicate', () => {
		const first = mangaStore.createFolder('Favoritos');
		const second = mangaStore.createFolder('favoritos');
		expect(second!.id).toBe(first!.id);
		expect(mangaStore.folders).toHaveLength(1);
	});

	it('renames a folder', () => {
		const folder = mangaStore.createFolder('Antigo')!;
		expect(mangaStore.renameFolder(folder.id, 'Novo')).toBe(true);
		expect(mangaStore.findFolder(folder.id)?.name).toBe('Novo');
	});

	it('refuses to rename to a name already taken by another folder', () => {
		const a = mangaStore.createFolder('A')!;
		mangaStore.createFolder('B');
		expect(mangaStore.renameFolder(a.id, 'b')).toBe(false);
		expect(mangaStore.findFolder(a.id)?.name).toBe('A');
	});

	it('allows renaming a folder to its own name', () => {
		const folder = mangaStore.createFolder('Mesmo')!;
		expect(mangaStore.renameFolder(folder.id, 'Mesmo')).toBe(true);
	});

	it('refuses to rename an unknown folder or use an empty name', () => {
		const folder = mangaStore.createFolder('X')!;
		expect(mangaStore.renameFolder('ghost', 'Y')).toBe(false);
		expect(mangaStore.renameFolder(folder.id, '  ')).toBe(false);
	});

	it('persists folders to localStorage', () => {
		mangaStore.createFolder('Salvo');
		const stored = JSON.parse(localStorage.getItem('hiraku-library') ?? '{}');
		expect(stored.folders).toHaveLength(1);
		expect(stored.folders[0].name).toBe('Salvo');
	});
});

describe('MangaStore folder assignment', () => {
	it('assigns a manga to a folder', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const folder = mangaStore.createFolder('Lendo')!;
		mangaStore.addMangaToFolder('m1', 'src', folder.id);
		expect(mangaStore.isMangaInFolder('m1', 'src', folder.id)).toBe(true);
		expect(mangaStore.mangasInFolder(folder.id)).toHaveLength(1);
	});

	it('lets a manga belong to several folders at once', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const a = mangaStore.createFolder('Lendo')!;
		const b = mangaStore.createFolder('Favoritos')!;
		mangaStore.addMangaToFolder('m1', 'src', a.id);
		mangaStore.addMangaToFolder('m1', 'src', b.id);
		expect(mangaStore.find('m1', 'src')?.folderIds).toEqual([a.id, b.id]);
		expect(mangaStore.foldersOf('m1', 'src').map((f) => f.name)).toEqual(['Lendo', 'Favoritos']);
	});

	it('is idempotent when assigning twice', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const folder = mangaStore.createFolder('Lendo')!;
		mangaStore.addMangaToFolder('m1', 'src', folder.id);
		mangaStore.addMangaToFolder('m1', 'src', folder.id);
		expect(mangaStore.find('m1', 'src')?.folderIds).toEqual([folder.id]);
	});

	it('removes a manga from a folder without removing it from the library', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const folder = mangaStore.createFolder('Lendo')!;
		mangaStore.addMangaToFolder('m1', 'src', folder.id);
		mangaStore.removeMangaFromFolder('m1', 'src', folder.id);
		expect(mangaStore.isMangaInFolder('m1', 'src', folder.id)).toBe(false);
		expect(mangaStore.library).toHaveLength(1);
	});

	it('toggles membership', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const folder = mangaStore.createFolder('Lendo')!;
		mangaStore.toggleMangaFolder('m1', 'src', folder.id);
		expect(mangaStore.isMangaInFolder('m1', 'src', folder.id)).toBe(true);
		mangaStore.toggleMangaFolder('m1', 'src', folder.id);
		expect(mangaStore.isMangaInFolder('m1', 'src', folder.id)).toBe(false);
	});

	it('ignores unknown mangas and unknown folders', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const folder = mangaStore.createFolder('Lendo')!;
		expect(() => mangaStore.addMangaToFolder('ghost', 'src', folder.id)).not.toThrow();
		mangaStore.addMangaToFolder('m1', 'src', 'no-such-folder');
		expect(mangaStore.find('m1', 'src')?.folderIds).toEqual([]);
		expect(() => mangaStore.removeMangaFromFolder('ghost', 'src', folder.id)).not.toThrow();
	});

	it('counts only mangas inside the folder', () => {
		mangaStore.addManga(makeManga({ id: 'in', source: 'src' }));
		mangaStore.addManga(makeManga({ id: 'out', source: 'src' }));
		const folder = mangaStore.createFolder('Lendo')!;
		mangaStore.addMangaToFolder('in', 'src', folder.id);
		expect(mangaStore.folderCount(folder.id)).toBe(1);
		expect(mangaStore.mangasInFolder(folder.id)[0].id).toBe('in');
	});

	it('keeps folder membership when the manga is re-added from the catalog', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src', title: 'Antigo' }));
		const folder = mangaStore.createFolder('Lendo')!;
		mangaStore.addMangaToFolder('m1', 'src', folder.id);
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src', title: 'Atualizado' }));
		expect(mangaStore.find('m1', 'src')?.title).toBe('Atualizado');
		expect(mangaStore.isMangaInFolder('m1', 'src', folder.id)).toBe(true);
	});

	it('drops folder membership when the manga leaves the library', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const folder = mangaStore.createFolder('Lendo')!;
		mangaStore.addMangaToFolder('m1', 'src', folder.id);
		mangaStore.removeManga('m1', 'src');
		expect(mangaStore.mangasInFolder(folder.id)).toHaveLength(0);
	});
});

describe('MangaStore.deleteFolder', () => {
	it('deletes the folder but keeps its mangas in the library', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src', title: 'Berserk' }));
		const folder = mangaStore.createFolder('Terror')!;
		mangaStore.addMangaToFolder('m1', 'src', folder.id);

		mangaStore.deleteFolder(folder.id);

		expect(mangaStore.folders).toHaveLength(0);
		expect(mangaStore.library).toHaveLength(1);
		expect(mangaStore.find('m1', 'src')?.title).toBe('Berserk');
		expect(mangaStore.find('m1', 'src')?.folderIds).toEqual([]);
	});

	it('does not touch membership of other folders', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src' }));
		const a = mangaStore.createFolder('A')!;
		const b = mangaStore.createFolder('B')!;
		mangaStore.addMangaToFolder('m1', 'src', a.id);
		mangaStore.addMangaToFolder('m1', 'src', b.id);

		mangaStore.deleteFolder(a.id);

		expect(mangaStore.find('m1', 'src')?.folderIds).toEqual([b.id]);
		expect(mangaStore.folders.map((f) => f.id)).toEqual([b.id]);
	});

	it('is safe for unknown folder ids', () => {
		expect(() => mangaStore.deleteFolder('ghost')).not.toThrow();
	});
});

describe('MangaStore storage migration', () => {
	/** Simula abrir o app com um localStorage ja gravado. */
	function loadFrom(raw: string) {
		localStorage.setItem('hiraku-library', raw);
		mangaStore.loadFromStorage();
	}

	it('reads a v1 library (bare array, no folders)', () => {
		loadFrom(JSON.stringify([makeManga({ id: 'old', source: 'src', title: 'Legado' })]));
		expect(mangaStore.library).toHaveLength(1);
		expect(mangaStore.library[0].title).toBe('Legado');
		expect(mangaStore.folders).toEqual([]);
	});

	it('gives v1 mangas an empty folderIds instead of undefined', () => {
		loadFrom(JSON.stringify([makeManga({ id: 'old', source: 'src' })]));
		expect(mangaStore.library[0].folderIds).toEqual([]);
	});

	it('upgrades a v1 library to the new envelope on the next write', () => {
		loadFrom(JSON.stringify([makeManga({ id: 'old', source: 'src' })]));
		mangaStore.createFolder('Nova');
		const stored = JSON.parse(localStorage.getItem('hiraku-library') ?? '{}');
		expect(stored.version).toBe(2);
		expect(stored.library).toHaveLength(1);
		expect(stored.folders).toHaveLength(1);
	});

	it('round-trips the v2 envelope with folders and membership', () => {
		mangaStore.addManga(makeManga({ id: 'm1', source: 'src', title: 'Round' }));
		const folder = mangaStore.createFolder('Terror')!;
		mangaStore.addMangaToFolder('m1', 'src', folder.id);

		// Reler o que acabou de ser gravado prova que o envelope sobrevive ao ciclo.
		mangaStore.loadFromStorage();
		expect(mangaStore.folders.map((f) => f.name)).toEqual(['Terror']);
		expect(mangaStore.isMangaInFolder('m1', 'src', folder.id)).toBe(true);
		expect(mangaStore.find('m1', 'src')?.title).toBe('Round');
	});

	it('normaliza capas gravadas com o host antigo embutido', () => {
		// Biblioteca montada em desenvolvimento: o host de localhost estava colado
		// na URL e a capa sumia ao abrir o app em producao.
		loadFrom(
			JSON.stringify([
				makeManga({
					id: 'old',
					source: 'src',
					coverUrl: 'http://localhost:8000/image?url=https%3A%2F%2Fx.to%2Fa.webp'
				})
			])
		);
		expect(mangaStore.library[0].coverUrl).toBe('/image?url=https%3A%2F%2Fx.to%2Fa.webp');
	});

	it('preserva capas absolutas de fontes com CORS', () => {
		const url = 'https://uploads.mangadex.org/covers/a/b.jpg';
		loadFrom(JSON.stringify([makeManga({ id: 'old', source: 'src', coverUrl: url })]));
		expect(mangaStore.library[0].coverUrl).toBe(url);
	});

	it('survives corrupted JSON without throwing', () => {
		expect(() => loadFrom('{ not json at all')).not.toThrow();
		expect(mangaStore.library).toEqual([]);
		expect(mangaStore.folders).toEqual([]);
	});

	it('survives an envelope with wrong-typed fields', () => {
		loadFrom(JSON.stringify({ version: 2, library: 'nope', folders: 42 }));
		expect(mangaStore.library).toEqual([]);
		expect(mangaStore.folders).toEqual([]);
	});

	it('discards folder entries missing id or name', () => {
		loadFrom(
			JSON.stringify({
				version: 2,
				library: [],
				folders: [{ id: 'ok', name: 'Boa', createdAt: 'x' }, { name: 'sem id' }, null, 'texto']
			})
		);
		expect(mangaStore.folders.map((f) => f.id)).toEqual(['ok']);
	});

	it('drops folderIds pointing at folders that no longer exist', () => {
		loadFrom(
			JSON.stringify({
				version: 2,
				library: [makeManga({ id: 'm1', source: 'src', folderIds: ['viva', 'morta'] })],
				folders: [{ id: 'viva', name: 'Viva', createdAt: 'x' }]
			})
		);
		expect(mangaStore.library[0].folderIds).toEqual(['viva']);
	});

	it('drops malformed manga entries but keeps the valid ones', () => {
		loadFrom(
			JSON.stringify({
				version: 2,
				library: [makeManga({ id: 'good', source: 'src' }), null, { source: 'src' }, 7],
				folders: []
			})
		);
		expect(mangaStore.library.map((m) => m.id)).toEqual(['good']);
	});
});
