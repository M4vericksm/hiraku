import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/persistence', () => ({
	PersistenceService: {
		saveHandle: vi.fn().mockResolvedValue(undefined),
		getHandle: vi.fn().mockResolvedValue(null),
		removeHandle: vi.fn().mockResolvedValue(undefined),
	},
}));

import { mangaStore, type Manga } from './manga.svelte';

function makeManga(overrides: Partial<Manga> = {}): Manga {
	return {
		id: crypto.randomUUID(),
		title: 'Test Manga',
		progress: 0,
		lastReadPage: 0,
		totalPage: 100,
		filePath: '/path/to/file.pdf',
		addedAt: new Date().toISOString(),
		bookmarks: [],
		...overrides,
	};
}

beforeEach(() => {
	mangaStore.clearAll();
});

describe('MangaStore.addManga', () => {
	it('adds a manga to the library', async () => {
		const manga = makeManga({ title: 'Berserk' });
		await mangaStore.addManga(manga);
		expect(mangaStore.library).toHaveLength(1);
		expect(mangaStore.library[0].title).toBe('Berserk');
	});

	it('prepends new manga to the library', async () => {
		const first = makeManga({ title: 'First' });
		const second = makeManga({ title: 'Second' });
		await mangaStore.addManga(first);
		await mangaStore.addManga(second);
		expect(mangaStore.library[0].title).toBe('Second');
		expect(mangaStore.library[1].title).toBe('First');
	});

	it('persists library to localStorage', async () => {
		const manga = makeManga({ title: 'Naruto' });
		await mangaStore.addManga(manga);
		const stored = JSON.parse(localStorage.getItem('hiraku-library') ?? '[]') as Manga[];
		expect(stored.some((m) => m.title === 'Naruto')).toBe(true);
	});
});

describe('MangaStore.updateProgress', () => {
	it('calculates progress percentage correctly', async () => {
		const manga = makeManga({ id: 'abc', totalPage: 200 });
		await mangaStore.addManga(manga);
		mangaStore.updateProgress('abc', 50, 200);
		const updated = mangaStore.library.find((m) => m.id === 'abc');
		expect(updated?.progress).toBe(25);
		expect(updated?.lastReadPage).toBe(50);
	});

	it('sets progress to 100 on last page', async () => {
		const manga = makeManga({ id: 'xyz', totalPage: 100 });
		await mangaStore.addManga(manga);
		mangaStore.updateProgress('xyz', 100, 100);
		const updated = mangaStore.library.find((m) => m.id === 'xyz');
		expect(updated?.progress).toBe(100);
	});

	it('sets lastReadAt timestamp', async () => {
		const manga = makeManga({ id: 'ts' });
		await mangaStore.addManga(manga);
		const before = Date.now();
		mangaStore.updateProgress('ts', 10, 100);
		const updated = mangaStore.library.find((m) => m.id === 'ts');
		const after = Date.now();
		const lastRead = new Date(updated!.lastReadAt!).getTime();
		expect(lastRead).toBeGreaterThanOrEqual(before);
		expect(lastRead).toBeLessThanOrEqual(after);
	});

	it('does nothing when id not found', () => {
		expect(() => mangaStore.updateProgress('nonexistent', 5, 10)).not.toThrow();
	});
});

describe('MangaStore.removeManga', () => {
	it('removes manga by id', async () => {
		const manga = makeManga({ id: 'del' });
		await mangaStore.addManga(manga);
		expect(mangaStore.library).toHaveLength(1);
		await mangaStore.removeManga('del');
		expect(mangaStore.library).toHaveLength(0);
	});

	it('does not affect other entries', async () => {
		const a = makeManga({ id: 'a', title: 'A' });
		const b = makeManga({ id: 'b', title: 'B' });
		await mangaStore.addManga(a);
		await mangaStore.addManga(b);
		await mangaStore.removeManga('a');
		expect(mangaStore.library).toHaveLength(1);
		expect(mangaStore.library[0].title).toBe('B');
	});
});

describe('MangaStore.recentManga', () => {
	it('returns only mangas with activity', async () => {
		const unread = makeManga({ id: 'u', lastReadPage: 0 });
		const read = makeManga({ id: 'r', lastReadPage: 5, lastReadAt: new Date().toISOString() });
		await mangaStore.addManga(unread);
		await mangaStore.addManga(read);
		expect(mangaStore.recentManga.every((m) => m.id !== 'u')).toBe(true);
		expect(mangaStore.recentManga.some((m) => m.id === 'r')).toBe(true);
	});

	it('returns at most 4 items', async () => {
		for (let i = 0; i < 6; i++) {
			await mangaStore.addManga(
				makeManga({ lastReadPage: 10, lastReadAt: new Date(Date.now() - i * 1000).toISOString() })
			);
		}
		expect(mangaStore.recentManga.length).toBeLessThanOrEqual(4);
	});

	it('is sorted by lastReadAt descending', async () => {
		const older = makeManga({
			id: 'old',
			lastReadPage: 1,
			lastReadAt: new Date('2026-01-01').toISOString(),
		});
		const newer = makeManga({
			id: 'new',
			lastReadPage: 1,
			lastReadAt: new Date('2026-03-01').toISOString(),
		});
		await mangaStore.addManga(older);
		await mangaStore.addManga(newer);
		expect(mangaStore.recentManga[0].id).toBe('new');
	});
});

describe('MangaStore.clearAll', () => {
	it('empties the library', async () => {
		await mangaStore.addManga(makeManga());
		mangaStore.clearAll();
		expect(mangaStore.library).toHaveLength(0);
	});

	it('removes localStorage entry', async () => {
		await mangaStore.addManga(makeManga());
		mangaStore.clearAll();
		expect(localStorage.getItem('hiraku-library')).toBeNull();
	});
});
