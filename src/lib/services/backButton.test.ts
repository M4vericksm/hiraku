import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O plugin do Capacitor e substituido por um duplo que guarda o callback do
 * evento `backButton`, para os testes dispararem o botao sem Android.
 */
let backCallback: (() => void) | null = null;
const exitApp = vi.fn();
const removeListener = vi.fn();

vi.mock('@capacitor/app', () => ({
	App: {
		addListener: vi.fn((event: string, cb: () => void) => {
			if (event === 'backButton') backCallback = cb;
			return Promise.resolve({ remove: removeListener });
		}),
		exitApp
	}
}));

const HISTORY_INDEX = 'sveltekit:history';

/** Simula o state que o roteador do SvelteKit grava em cada navegacao. */
function setHistoryIndex(value: number | null) {
	history.replaceState(value === null ? null : { [HISTORY_INDEX]: value }, '');
}

describe('botao voltar do Android', () => {
	let initBackButton: typeof import('./backButton').initBackButton;
	let destroyBackButton: typeof import('./backButton').destroyBackButton;
	let pushBackHandler: typeof import('./backButton').pushBackHandler;
	let back: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		backCallback = null;
		// Modulo tem estado no escopo do arquivo (baseIndex, listener): recarrega.
		vi.resetModules();
		const mod = await import('./backButton');
		initBackButton = mod.initBackButton;
		destroyBackButton = mod.destroyBackButton;
		pushBackHandler = mod.pushBackHandler;
		back = vi.spyOn(history, 'back').mockImplementation(() => {});
	});

	it('volta no historico quando ha telas empilhadas', async () => {
		setHistoryIndex(0);
		await initBackButton();

		// Navegou duas telas adiante.
		setHistoryIndex(2);
		backCallback?.();

		expect(back).toHaveBeenCalledOnce();
		expect(exitApp).not.toHaveBeenCalled();
	});

	it('fecha o app apenas na tela inicial', async () => {
		setHistoryIndex(5);
		await initBackButton();

		// Mesmo indice do momento em que o app abriu: nao ha para onde voltar.
		backCallback?.();

		expect(back).not.toHaveBeenCalled();
		expect(exitApp).toHaveBeenCalledOnce();
	});

	it('le a chave do SvelteKit, nao um "index" generico', async () => {
		// Regressao: uma versao anterior lia `history.state.index`, que o roteador
		// nunca grava. A profundidade dava sempre 0 e o app fechava de qualquer tela.
		setHistoryIndex(0);
		await initBackButton();

		history.replaceState({ index: 9 }, '');
		backCallback?.();

		// Sem a chave certa nao da para medir: nao fecha o app por engano.
		expect(back).not.toHaveBeenCalled();
	});

	it('fixa a base na primeira leitura valida quando o roteador ainda nao hidratou', async () => {
		// onMount do layout pode rodar antes do roteador gravar o state.
		setHistoryIndex(null);
		await initBackButton();

		// Primeira leitura valida vira a base: ainda e a tela inicial.
		setHistoryIndex(3);
		backCallback?.();
		expect(exitApp).toHaveBeenCalledOnce();

		// Uma tela adiante da base agora volta.
		setHistoryIndex(4);
		backCallback?.();
		expect(back).toHaveBeenCalledOnce();
	});

	it('deixa um handler consumir o evento antes de navegar', async () => {
		setHistoryIndex(0);
		await initBackButton();
		setHistoryIndex(3);

		const release = pushBackHandler(() => true);
		backCallback?.();

		expect(back).not.toHaveBeenCalled();
		expect(exitApp).not.toHaveBeenCalled();

		// Depois de liberado, o evento volta a navegar.
		release();
		backCallback?.();
		expect(back).toHaveBeenCalledOnce();
	});

	it('passa para o proximo handler quando o de cima nao consome', async () => {
		setHistoryIndex(0);
		await initBackButton();
		setHistoryIndex(3);

		const order: string[] = [];
		pushBackHandler(() => {
			order.push('antigo');
			return false;
		});
		pushBackHandler(() => {
			order.push('recente');
			return false;
		});

		backCallback?.();

		// Do mais recente para o mais antigo: modais antes de navegacao.
		expect(order).toEqual(['recente', 'antigo']);
		expect(back).toHaveBeenCalledOnce();
	});

	it('um handler que lanca nao impede os demais', async () => {
		setHistoryIndex(0);
		await initBackButton();
		setHistoryIndex(3);

		vi.spyOn(console, 'error').mockImplementation(() => {});
		pushBackHandler(() => {
			throw new Error('falhou');
		});

		expect(() => backCallback?.()).not.toThrow();
		expect(back).toHaveBeenCalledOnce();
	});

	it('nao registra o listener duas vezes', async () => {
		const { App } = await import('@capacitor/app');
		setHistoryIndex(0);

		await initBackButton();
		await initBackButton();

		expect(App.addListener).toHaveBeenCalledOnce();
		await destroyBackButton();
	});
});
