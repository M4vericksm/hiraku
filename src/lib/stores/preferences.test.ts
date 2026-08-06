import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { preferences, SCROLL_SPEEDS } from './preferences.svelte';

const STORAGE_KEY = 'hiraku-preferences';

function stored(): Record<string, unknown> {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

beforeEach(() => {
	localStorage.clear();
	preferences.setTheme('theme-ink');
	preferences.setReadingMode('rtl');
	preferences.setAutoScrollSpeedLevel(3);
});

afterEach(() => {
	localStorage.clear();
});

describe('PreferencesStore persistence', () => {
	it('writes the theme to storage so it survives a restart', () => {
		preferences.setTheme('theme-neon');
		expect(preferences.theme).toBe('theme-neon');
		expect(stored().theme).toBe('theme-neon');
	});

	it('persists the reading mode, which used to reset every chapter', () => {
		preferences.setReadingMode('vertical');
		expect(stored().readingMode).toBe('vertical');
	});
});

describe('PreferencesStore auto-scroll speed', () => {
	it('exposes the speed matching the selected level', () => {
		preferences.setAutoScrollSpeedLevel(5);
		expect(preferences.scrollSpeed.level).toBe(5);
		expect(preferences.scrollSpeed.pixelsPerSecond).toBe(
			SCROLL_SPEEDS[SCROLL_SPEEDS.length - 1].pixelsPerSecond
		);
	});

	it('clamps a level above the range instead of breaking the reader', () => {
		preferences.setAutoScrollSpeedLevel(99);
		expect(preferences.autoScrollSpeedLevel).toBe(SCROLL_SPEEDS.length);
	});

	it('clamps a level below the range', () => {
		preferences.setAutoScrollSpeedLevel(0);
		expect(preferences.autoScrollSpeedLevel).toBe(1);
	});

	it('falls back to the default when handed a non-finite level', () => {
		preferences.setAutoScrollSpeedLevel(Number.NaN);
		expect(preferences.autoScrollSpeedLevel).toBe(3);
	});

	it('always resolves a speed for every valid level', () => {
		for (const speed of SCROLL_SPEEDS) {
			preferences.setAutoScrollSpeedLevel(speed.level);
			expect(preferences.scrollSpeed).toEqual(speed);
		}
	});
});