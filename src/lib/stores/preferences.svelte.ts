const STORAGE_KEY = 'hiraku-preferences';

/** Chave antiga, migrada na primeira carga. */
const LEGACY_THEME_KEY = 'hiraku-theme';

export type ReadingMode = 'rtl' | 'vertical';

/**
 * Velocidades do auto-scroll. Cada nivel vale para os dois modos de leitura:
 * no vertical vira px/s (rolagem continua), no paginado vira o intervalo entre
 * viradas de pagina. Niveis discretos em vez de slider livre porque o que o
 * usuario quer e escolher "devagar/normal/rapido", nao calibrar um numero.
 */
export interface ScrollSpeed {
	level: number;
	label: string;
	/** Modo vertical: pixels por segundo. */
	pixelsPerSecond: number;
	/** Modo paginado: segundos que cada pagina fica na tela. */
	secondsPerPage: number;
}

export const SCROLL_SPEEDS: readonly ScrollSpeed[] = [
	{ level: 1, label: 'Muito lento', pixelsPerSecond: 20, secondsPerPage: 12 },
	{ level: 2, label: 'Lento', pixelsPerSecond: 40, secondsPerPage: 8 },
	{ level: 3, label: 'Normal', pixelsPerSecond: 70, secondsPerPage: 5 },
	{ level: 4, label: 'Rápido', pixelsPerSecond: 110, secondsPerPage: 3.5 },
	{ level: 5, label: 'Muito rápido', pixelsPerSecond: 170, secondsPerPage: 2 }
];

const DEFAULT_SPEED_LEVEL = 3;

interface PersistedPreferences {
	theme: string;
	readingMode: ReadingMode;
	autoScrollSpeedLevel: number;
	language: string;
	dataSaver: boolean;
}

const DEFAULTS: PersistedPreferences = {
	theme: 'theme-ink',
	readingMode: 'rtl',
	autoScrollSpeedLevel: DEFAULT_SPEED_LEVEL,
	language: 'pt-br',
	dataSaver: false
};

function clampLevel(level: number): number {
	if (!Number.isFinite(level)) return DEFAULT_SPEED_LEVEL;
	return Math.min(SCROLL_SPEEDS.length, Math.max(1, Math.round(level)));
}

/**
 * Preferencias do app em um lugar so. Antes o tema vivia em localStorage lido
 * direto por dois componentes, e o modo de leitura nao era salvo - trocar de
 * capitulo voltava tudo ao padrao.
 */
class PreferencesStore {
	theme = $state(DEFAULTS.theme);
	readingMode = $state<ReadingMode>(DEFAULTS.readingMode);
	autoScrollSpeedLevel = $state(DEFAULTS.autoScrollSpeedLevel);
	language = $state(DEFAULTS.language);
	dataSaver = $state(DEFAULTS.dataSaver);

	constructor() {
		if (typeof window === 'undefined') return;
		this.load();
	}

	private load() {
		let stored: Partial<PersistedPreferences> = {};
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) stored = JSON.parse(raw) as Partial<PersistedPreferences>;
		} catch (e) {
			console.error('Falha ao processar preferências', e);
		}

		// Migra o tema salvo pela versao anterior, que usava chave propria.
		const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
		if (legacyTheme && !stored.theme) stored.theme = legacyTheme;

		if (typeof stored.theme === 'string') this.theme = stored.theme;
		if (stored.readingMode === 'rtl' || stored.readingMode === 'vertical') {
			this.readingMode = stored.readingMode;
		}
		if (typeof stored.language === 'string') this.language = stored.language;
		if (typeof stored.dataSaver === 'boolean') this.dataSaver = stored.dataSaver;
		if (typeof stored.autoScrollSpeedLevel === 'number') {
			this.autoScrollSpeedLevel = clampLevel(stored.autoScrollSpeedLevel);
		}
	}

	private save() {
		if (typeof window === 'undefined') return;
		const payload: PersistedPreferences = {
			theme: this.theme,
			readingMode: this.readingMode,
			autoScrollSpeedLevel: this.autoScrollSpeedLevel,
			language: this.language,
			dataSaver: this.dataSaver
		};
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
			localStorage.removeItem(LEGACY_THEME_KEY);
		} catch (e) {
			console.error('Falha ao salvar preferências', e);
		}
	}

	setTheme(theme: string) {
		this.theme = theme;
		this.save();
	}

	setReadingMode(mode: ReadingMode) {
		this.readingMode = mode;
		this.save();
	}

	setAutoScrollSpeedLevel(level: number) {
		this.autoScrollSpeedLevel = clampLevel(level);
		this.save();
	}

	setLanguage(language: string) {
		this.language = language;
		this.save();
	}

	setDataSaver(enabled: boolean) {
		this.dataSaver = enabled;
		this.save();
	}

	get scrollSpeed(): ScrollSpeed {
		return SCROLL_SPEEDS.find((s) => s.level === this.autoScrollSpeedLevel) ?? SCROLL_SPEEDS[2];
	}
}

export const preferences = new PreferencesStore();
