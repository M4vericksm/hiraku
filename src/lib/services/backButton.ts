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
 * Quantas telas foram empilhadas desde que o app abriu.
 *
 * A versao anterior lia `history.state['sveltekit:history']` e subtraia de uma
 * base capturada no `onMount` do layout. Duas coisas quebravam isso no APK: o
 * roteador so grava esse state depois de hidratar (o `onMount` do layout roda
 * antes, entao a base vinha `null`) e, quando vinha `null`, a base acabava
 * sendo fixada na *primeira leitura valida* — que era o proprio momento do
 * primeiro toque em voltar, ja dentro do leitor. Resultado: profundidade 0 em
 * qualquer tela e `exitApp()` imediato.
 *
 * Agora o proprio roteador avisa a cada navegacao (`trackNavigation`, ligado ao
 * `afterNavigate` do layout). O contador nao depende de nenhum detalhe interno
 * do SvelteKit nem do timing de hidratacao.
 */
let depth = 0;

/**
 * Janela do "toque de novo para sair". So vale na tela inicial: em qualquer
 * outra rota o botao navega, nunca fecha.
 */
const EXIT_CONFIRM_MS = 2000;
let exitArmedUntil = 0;

/** Aviso visual do duplo toque. O layout pluga um toast aqui. */
let onExitPrompt: (() => void) | null = null;

export function setExitPrompt(fn: (() => void) | null): void {
	onExitPrompt = fn;
}

/**
 * Rota inicial e como chegar la, injetados pelo layout.
 *
 * Importar `$app/navigation` e `$app/paths` aqui acoplaria este servico ao
 * roteador: sao modulos virtuais que so existem dentro do build do SvelteKit, e
 * a suite de testes nem carregava o arquivo por causa deles.
 */
let home = '/';
let navigateHome: (path: string) => void = () => {};

export function setHomeNavigation(path: string, go: (path: string) => void): void {
	home = path;
	navigateHome = go;
}

/**
 * Tipos de navegacao do SvelteKit que empilham uma entrada no historico.
 * `replaceState` troca a entrada atual e `leave` sai do app — nenhum dos dois
 * muda a profundidade.
 */
const PUSHING_TYPES = new Set(['link', 'goto', 'form', 'pushState']);

/**
 * Contabiliza uma navegacao. Chamado pelo `afterNavigate` do layout raiz.
 * `type` vem do objeto de navegacao do SvelteKit.
 */
export function trackNavigation(type: string): void {
	if (type === 'enter') {
		// Carga inicial (ou recarga direto numa URL profunda): esta e a raiz da
		// sessao. Nao ha historico anterior dentro do app para voltar.
		depth = 0;
		return;
	}
	if (type === 'popstate') {
		depth = Math.max(0, depth - 1);
		return;
	}
	if (PUSHING_TYPES.has(type)) depth += 1;
}

/** Existe para os testes: o contador vive no escopo do modulo. */
export function getNavigationDepth(): number {
	return depth;
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

function isAtHome(): boolean {
	const path = window.location.pathname;
	// `/hiraku` e `/hiraku/` sao a mesma tela.
	return path === home || `${path}/` === home;
}

function handleBack(): void {
	if (runHandlers()) return;

	// Telas empilhadas dentro do app: desempilha uma.
	if (depth > 0) {
		history.back();
		return;
	}

	// Profundidade zero mas fora da home — acontece ao recarregar direto numa
	// URL profunda, ou quando o contador se perde. Ir para a estante e sempre
	// melhor que fechar o app na cara de quem so queria voltar.
	if (!isAtHome()) {
		navigateHome(home);
		return;
	}

	// Na home: exige confirmacao. Um toque avisa, o segundo dentro da janela
	// fecha. Sem isso um toque distraido matava a sessao de leitura.
	const now = Date.now();
	if (now < exitArmedUntil) {
		void App.exitApp();
		return;
	}
	exitArmedUntil = now + EXIT_CONFIRM_MS;
	onExitPrompt?.();
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
			listener = await App.addListener('backButton', handleBack);
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
	depth = 0;
	exitArmedUntil = 0;
	onExitPrompt = null;
	home = '/';
	navigateHome = () => {};
}
