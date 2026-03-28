import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataService } from './metadata';

describe('MetadataService.extractTitleFromFilename', () => {
	it('removes file extension', async () => {
		expect(await MetadataService.extractTitleFromFilename('Berserk.pdf')).toBe('Berserk');
	});

	it('removes content inside square brackets', async () => {
		expect(await MetadataService.extractTitleFromFilename('[Fansub] One Piece.pdf')).toBe(
			'One Piece'
		);
	});

	it('removes content inside parentheses', async () => {
		expect(await MetadataService.extractTitleFromFilename('Naruto (Volume 01).pdf')).toBe(
			'Naruto'
		);
	});

	it('trims leading and trailing whitespace', async () => {
		expect(await MetadataService.extractTitleFromFilename('  Bleach  .pdf')).toBe('Bleach');
	});

	it('handles combined brackets and parentheses', async () => {
		expect(
			await MetadataService.extractTitleFromFilename('[Group] Attack on Titan (Vol 3).cbz')
		).toBe('Attack on Titan');
	});

	it('handles filename with no extension', async () => {
		expect(await MetadataService.extractTitleFromFilename('DragonBall')).toBe('DragonBall');
	});
});

describe('MetadataService.searchAniList', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns mapped results from AniList response', async () => {
		const mockResponse = {
			data: {
				Page: {
					media: [
						{
							id: 1,
							title: { english: 'Berserk', romaji: 'Berserk' },
							coverImage: { large: 'https://example.com/cover.jpg' },
							description: 'Dark fantasy manga.',
							staff: { nodes: [{ name: { full: 'Kentaro Miura' } }] },
						},
					],
				},
			},
		};

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				json: vi.fn().mockResolvedValue(mockResponse),
			})
		);

		const results = await MetadataService.searchAniList('Berserk');

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			id: '1',
			title: 'Berserk',
			coverUrl: 'https://example.com/cover.jpg',
			description: 'Dark fantasy manga.',
			author: 'Kentaro Miura',
		});
	});

	it('prefers english title over romaji', async () => {
		const mockResponse = {
			data: {
				Page: {
					media: [
						{
							id: 2,
							title: { english: 'One Piece', romaji: 'One Piece' },
							coverImage: { large: 'https://example.com/op.jpg' },
							description: 'Pirate adventure.',
							staff: { nodes: [] },
						},
					],
				},
			},
		};

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				json: vi.fn().mockResolvedValue(mockResponse),
			})
		);

		const results = await MetadataService.searchAniList('One Piece');
		expect(results[0].title).toBe('One Piece');
	});

	it('falls back to romaji when english title is null', async () => {
		const mockResponse = {
			data: {
				Page: {
					media: [
						{
							id: 3,
							title: { english: null, romaji: 'Shingeki no Kyojin' },
							coverImage: { large: 'https://example.com/aot.jpg' },
							description: 'Titans.',
							staff: { nodes: [] },
						},
					],
				},
			},
		};

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				json: vi.fn().mockResolvedValue(mockResponse),
			})
		);

		const results = await MetadataService.searchAniList('Shingeki');
		expect(results[0].title).toBe('Shingeki no Kyojin');
	});

	it('returns empty array on fetch error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

		const results = await MetadataService.searchAniList('anything');
		expect(results).toEqual([]);
	});
});
