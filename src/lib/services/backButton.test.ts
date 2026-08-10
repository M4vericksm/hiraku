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

/** Faz o papel do `goto` do SvelteKit, injetado pelo layout. */
const goto = vi.fn();

/** Coloca o WebView numa rota, como o roteador faria. */
function setPath(path: string) {
	history.replaceState(null, '', path);
}

describe('botao voltar do Android', () => {
	let initBackButton: typeof import('./backButton').initBackButton;
	let destroyBackButton: typeof import('./backButton').destroyBackButton;
	let pushBackHandler: typeof import('./backButton').pushBackHandler;
	let trackNavigation: typeof import('./backButton').trackNavigation;
	let setExitPrompt: typeof import('./backButton').setExitPrompt;
	let setHomeNavigation: typeof import('./backButton').setHomeNavigation;
	let back: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		backCallback = null;
		// Modulo tem estado no escopo do arquivo (depth, listener): recarrega.
		vi.resetModules();
		const mod = await import('./backButton');
		initBackButton = mod.initBackButton;
		destroyBackButton = mod.destroyBackButton;
		pushBackHandler = mod.pushBackHandler;
		trackNavigation = mod.trackNavigation;
		setExitPrompt = mod.setExitPrompt;
		setHomeNavigation = mod.setHomeNavigation;
		setHomeNavigation('/', goto);
		back = vi.spyOn(history, 'back').mockImplementation(() => {});
		setPath('/');
	});

	it('volta no historico quando ha telas empilhadas', async () => {
		await initBackButton();
		trackNavigation('enter');

		// Catalogo -> obra -> leitor.
		trackNavigation('link');
		trackNavigation('link');
		setPath('/reader/mangadex/abc/cap-1');

		backCallback?.();

		expect(back).toHaveBeenCalledOnce();
		expect(exitApp).not.toHaveBeenCalled();
	});

	it('nao fecha o app no primeiro toque na tela inicial', async () => {
		// Regressao: a base do contador era fixada tarde demais, a profundidade
		// dava sempre 0 e o primeiro toque fechava o app de qualquer tela.
		await initBackButton();
		trackNavigation('enter');

		backCallback?.();

		expect(exitApp).not.toHaveBeenCalled();
		expect(back).not.toHaveBeenCalled();
	});

	it('fecha o app no segundo toque seguido na tela inicial', async () => {
		await initBackButton();
		trackNavigation('enter');

		backCallback?.();
		backCallback?.();

		expect(exitApp).toHaveBeenCalledOnce();
	});

	it('avisa antes de sair, para o duplo toque nao parecer um botao quebrado', async () => {
		await initBackButton();
		trackNavigation('enter');

		const prompt = vi.fn();
		setExitPrompt(prompt);
		backCallback?.();

		expect(prompt).toHaveBeenCalledOnce();
	});

	it('esquece a confirmacao depois da janela de 2s', async () => {
		vi.useFakeTimers();
		try {
			await initBackButton();
			trackNavigation('enter');

			backCallback?.();
			vi.advanceTimersByTime(2500);
			backCallback?.();

			// O segundo toque veio tarde: rearma em vez de fechar.
			expect(exitApp).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('vai para a estante quando abriu direto numa rota profunda', async () => {
		// Recarregar dentro do leitor zera a profundidade; fechar o app ali seria
		// pior que subir uma tela.
		await initBackButton();
		setPath('/reader/mangadex/abc/cap-1');
		trackNavigation('enter');

		backCallback?.();

		expect(goto).toHaveBeenCalledWith('/');
		expect(exitApp).not.toHaveBeenCalled();
	});

	it('desconta a profundidade ao voltar', async () => {
		await initBackButton();
		trackNavigation('enter');
		trackNavigation('link');
		setPath('/manga/mangadex/abc');

		backCallback?.();
		expect(back).toHaveBeenCalledOnce();

		// O roteador confirma o retorno; agora estamos na raiz de novo.
		trackNavigation('popstate');
		setPath('/');
		backCallback?.();

		// Nao volta mais: so arma a saida.
		expect(back).toHaveBeenCalledOnce();
		expect(exitApp).not.toHaveBeenCalled();
	});

	it('nao conta replaceState como uma tela nova', async () => {
		// O leitor troca a URL do capitulo sem empilhar; contar isso faria o
		// botao voltar precisar de varios toques para sair de uma tela so.
		await initBackButton();
		trackNavigation('enter');
		trackNavigation('replaceState');

		backCallback?.();

		expect(back).not.toHaveBeenCalled();
	});

	it('deixa um handler consumir o evento antes de navegar', async () => {
		await initBackButton();
		trackNavigation('enter');
		trackNavigation('link');

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
		await initBackButton();
		trackNavigation('enter');
		trackNavigation('link');

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
		await initBackButton();
		trackNavigation('enter');
		trackNavigation('link');

		vi.spyOn(console, 'error').mockImplementation(() => {});
		pushBackHandler(() => {
			throw new Error('falhou');
		});

		expect(() => backCallback?.()).not.toThrow();
		expect(back).toHaveBeenCalledOnce();
	});

	it('nao registra o listener duas vezes', async () => {
		const { App } = await import('@capacitor/app');

		await initBackButton();
		await initBackButton();

		expect(App.addListener).toHaveBeenCalledOnce();
		await destroyBackButton();
	});
});
