import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pageDirection, preferences, SCROLL_SPEEDS } from './preferences.svelte';

const STORAGE_KEY = 'hiraku-preferences';

function stored(): Record<string, unknown> {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

beforeEach(() => {
	localStorage.clear();
	preferences.setTheme('theme-ink');
	preferences.setReadingMode('ltr');
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

	it('aceita ltr vindo do storage — o modo novo nao pode cair no default', () => {
		preferences.setReadingMode('ltr');
		expect(stored().readingMode).toBe('ltr');
	});
});

describe('pageDirection', () => {
	it('no modo ocidental a seta direita avanca', () => {
		expect(pageDirection('ltr', 'right')).toBe('next');
		expect(pageDirection('ltr', 'left')).toBe('prev');
	});

	it('no modo mangá o sentido inverte — a proxima pagina fica a esquerda', () => {
		expect(pageDirection('rtl', 'left')).toBe('next');
		expect(pageDirection('rtl', 'right')).toBe('prev');
	});

	it('no scroll continuo as setas nao viram pagina', () => {
		expect(pageDirection('vertical', 'left')).toBe('none');
		expect(pageDirection('vertical', 'right')).toBe('none');
	});

	it('cada lado faz uma coisa diferente — nunca os dois o mesmo', () => {
		for (const mode of ['ltr', 'rtl'] as const) {
			expect(pageDirection(mode, 'left')).not.toBe(pageDirection(mode, 'right'));
		}
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
