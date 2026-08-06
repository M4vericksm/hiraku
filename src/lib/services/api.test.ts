import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveImageUrl, BackendApiService, ApiError, AbortedError, isAborted } from './api';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

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

describe('request retry and abort', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('retries a 502 and returns the eventual success', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse({ detail: 'source down' }, 502))
			.mockResolvedValueOnce(jsonResponse([{ id: 'mangadex', name: 'MangaDex' }]));

		await expect(BackendApiService.getSources()).resolves.toEqual([
			{ id: 'mangadex', name: 'MangaDex' }
		]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not retry a 404 — the content simply is not there', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));

		await expect(BackendApiService.getDetail('mangadex', 'abc')).rejects.toMatchObject({
			status: 404
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('gives up after the retries are exhausted', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(jsonResponse({ detail: 'source down' }, 502));

		await expect(BackendApiService.getSources()).rejects.toBeInstanceOf(ApiError);
		// tentativa inicial + 2 retentativas
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('surfaces an AbortedError when the caller cancels, without retrying', async () => {
		const controller = new AbortController();
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
			const signal = (init as RequestInit | undefined)?.signal;
			return new Promise((_resolve, reject) => {
				signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			});
		});

		const promise = BackendApiService.getSources(controller.signal);
		controller.abort();

		await expect(promise).rejects.toSatisfy(isAborted);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('rejects immediately when handed an already-aborted signal', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch');
		await expect(BackendApiService.getSources(AbortSignal.abort())).rejects.toBeInstanceOf(
			AbortedError
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
