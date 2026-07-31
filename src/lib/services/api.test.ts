import { describe, it, expect } from 'vitest';
import { resolveImageUrl } from './api';

describe('resolveImageUrl', () => {
	it('resolves proxy paths against the API base', () => {
		expect(resolveImageUrl('/image?url=https%3A%2F%2Fmangalivre.to%2Fa.webp')).toBe(
			'http://localhost:8000/image?url=https%3A%2F%2Fmangalivre.to%2Fa.webp'
		);
	});

	it('leaves absolute source URLs untouched', () => {
		const url = 'https://uploads.mangadex.org/covers/a/b.jpg';
		expect(resolveImageUrl(url)).toBe(url);
	});

	it('leaves object URLs untouched so offline pages still render', () => {
		const url = 'blob:http://localhost:5173/8f2a-1234';
		expect(resolveImageUrl(url)).toBe(url);
	});

	it('returns undefined for missing values', () => {
		expect(resolveImageUrl(undefined)).toBeUndefined();
		expect(resolveImageUrl(null)).toBeUndefined();
		expect(resolveImageUrl('')).toBeUndefined();
	});
});
