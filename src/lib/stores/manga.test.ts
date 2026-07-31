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

	it('persists library to localStorage', () => {
		const manga = makeManga({ title: 'Naruto' });
		mangaStore.addManga(manga);
		const stored = JSON.parse(localStorage.getItem('hiraku-library') ?? '[]') as Manga[];
		expect(stored.some((m) => m.title === 'Naruto')).toBe(true);
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
});
