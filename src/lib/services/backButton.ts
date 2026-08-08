import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Handler de "voltar". Retorna true se consumiu o evento (fechou um modal,
 * saiu do fullscreen), false se deve deixar passar para o proximo nivel.
 */
export type BackHandler = () => boolean;

/**
 * Pilha de handlers do botao voltar do Android.
 *
 * Sem isso o botao fechava o app direto de qualquer tela, porque o WebView do
 * Capacitor nao tem historico proprio quando a rota inicial e a unica entrada.
 * A pilha resolve na ordem inversa do registro: o ultimo componente a montar
 * (um modal, por exemplo) tem a primeira chance de consumir o evento.
 */
const handlers: BackHandler[] = [];

let listener: PluginListenerHandle | null = null;
let registering: Promise<void> | null = null;

/**
 * Chave sob a qual o roteador do SvelteKit grava o indice do historico.
 * Vem de `@sveltejs/kit/src/runtime/client/constants.js` — nao e exportada
 * publicamente, entao fica fixada aqui.
 */
const HISTORY_INDEX = 'sveltekit:history';

/**
 * Profundidade do historico desde que o app abriu.
 *
 * `history.length` nao serve: no WebView ele ja comeca em 1+ e nunca diminui ao
 * voltar. Guardamos o indice do roteador na entrada inicial e medimos a
 * diferenca — 0 significa "estamos na tela onde o app abriu".
 */
let baseIndex: number | null = null;

function historyIndex(): number | null {
	const state = history.state as Record<string, unknown> | null;
	const value = state?.[HISTORY_INDEX];
	return typeof value === 'number' ? value : null;
}

function getHistoryDepth(): number {
	const current = historyIndex();
	// Sem state do roteador: nao da para medir, entao nao arrisca fechar o app.
	if (current === null) return 0;

	// A base so fica disponivel depois que o roteador hidrata, o que pode ser
	// depois do onMount do layout. Na primeira leitura valida, fixa aqui.
	if (baseIndex === null) baseIndex = current;

	return current - baseIndex;
}

/**
 * Registra um handler enquanto o componente estiver montado.
 * Devolve a funcao de limpeza para chamar no onDestroy.
 */
export function pushBackHandler(handler: BackHandler): () => void {
	handlers.push(handler);
	return () => {
		const index = handlers.lastIndexOf(handler);
		if (index !== -1) handlers.splice(index, 1);
	};
}

function runHandlers(): boolean {
	// Do mais recente para o mais antigo: modais antes de navegacao.
	for (let i = handlers.length - 1; i >= 0; i--) {
		try {
			if (handlers[i]()) return true;
		} catch (e) {
			console.error('Handler do botao voltar falhou', e);
		}
	}
	return false;
}

/**
 * Liga o botao voltar do Android. Idempotente: chamar de novo nao duplica o
 * listener. Fora do Capacitor (browser/dev) e um no-op silencioso.
 */
export async function initBackButton(): Promise<void> {
	if (typeof window === 'undefined' || listener) return;
	if (registering) return registering;

	// Marca onde o app abriu, para saber ate onde o "voltar" pode recuar.
	// Pode ser null aqui se o roteador ainda nao hidratou; nesse caso
	// `getHistoryDepth` fixa a base na primeira leitura valida.
	baseIndex = historyIndex();

	registering = (async () => {
		try {
			listener = await App.addListener('backButton', () => {
				if (runHandlers()) return;

				// Nenhum componente consumiu: volta no historico do SvelteKit.
				//
				// `canGoBack` do Capacitor reflete o historico do WebView, que numa
				// SPA nao acompanha a navegacao client-side — vinha sempre false e o
				// app fechava de qualquer tela. O contador de entradas do proprio
				// roteador e a fonte confiavel.
				if (getHistoryDepth() > 0) {
					history.back();
				} else {
					void App.exitApp();
				}
			});
		} catch (e) {
			// Plugin ausente (rodando no browser) nao e erro.
			console.debug('Botao voltar nativo indisponivel', e);
		} finally {
			registering = null;
		}
	})();

	return registering;
}

export async function destroyBackButton(): Promise<void> {
	await listener?.remove();
	listener = null;
	handlers.length = 0;
	baseIndex = null;
}