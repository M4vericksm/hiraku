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

	registering = (async () => {
		try {
			listener = await App.addListener('backButton', ({ canGoBack }) => {
				if (runHandlers()) return;

				// Nenhum componente consumiu: volta no historico, e so fecha o app
				// quando realmente nao ha para onde voltar.
				if (canGoBack || window.history.length > 1) {
					window.history.back();
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
}