import { describe, it, expect } from 'vitest';
import { cn, formatBytes } from './utils';

describe('cn', () => {
	it('returns a single class unchanged', () => {
		expect(cn('foo')).toBe('foo');
	});

	it('merges multiple classes', () => {
		expect(cn('foo', 'bar')).toBe('foo bar');
	});

	it('ignores falsy values', () => {
		expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
	});

	it('resolves tailwind conflicts (last wins)', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
	});

	it('handles conditional objects', () => {
		expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500');
	});

	it('returns empty string with no args', () => {
		expect(cn()).toBe('');
	});
});

describe('formatBytes', () => {
	it('formats bytes without decimals', () => {
		expect(formatBytes(512)).toBe('512 B');
	});

	it('formats kilobytes and megabytes with one decimal', () => {
		expect(formatBytes(1536)).toBe('1,5 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB');
	});

	it('caps the unit at gigabytes', () => {
		expect(formatBytes(3 * 1024 ** 4)).toContain('GB');
	});

	it('handles zero and invalid input', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(-10)).toBe('0 B');
		expect(formatBytes(NaN)).toBe('0 B');
	});
});
