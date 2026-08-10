/**
 * Handoff de titulo e capa entre a lista e a pagina de detalhe.
 *
 * Ao abrir uma obra, o detalhe so conhece `source` e `id` — o resto vem de uma
 * requisicao. Ate ela voltar a tela ficava com o titulo literal "Manga" e um
 * quadro vazio no lugar da capa, mesmo o card de origem ja tendo os dois na
 * mao. Guardar esse par no clique elimina a piscada: a pagina abre com a capa
 * e o titulo certos e so troca pelos dados completos quando o backend responde.
 *
 * Fica em memoria de proposito. E cache de navegacao, nao persistencia: se a
 * pessoa recarregar a pagina direto na URL do detalhe, o esqueleto de
 * carregamento assume e nada fica desatualizado.
 *
 * Modulo `.ts` puro, nao `.svelte.ts`: o Map e escrito no clique e lido no
 * `onMount` da tela seguinte, entao ninguem precisa reagir a mutacao dele.
 */
export interface MangaPreview {
	title: string;
	coverUrl?: string;
}

/**
 * Teto pequeno porque o cache serve a um pulo de tela. Guardar a busca inteira
 * so seguraria memoria de resultado que a pessoa nunca vai abrir.
 */
const MAX_ENTRIES = 60;

const previews = new Map<string, MangaPreview>();

function keyOf(source: string, id: string): string {
	return `${source}:${id}`;
}

export function rememberPreview(source: string, id: string, preview: MangaPreview): void {
	if (!source || !id || !preview.title) return;

	const key = keyOf(source, id);
	// Reinsere para o mais recente ir para o fim: a primeira chave do Map e a
	// mais antiga, que e a que sai quando o teto estoura.
	previews.delete(key);
	previews.set(key, preview);

	if (previews.size > MAX_ENTRIES) {
		const oldest = previews.keys().next();
		if (!oldest.done) previews.delete(oldest.value);
	}
}

export function recallPreview(source: string, id: string): MangaPreview | undefined {
	if (!source || !id) return undefined;
	return previews.get(keyOf(source, id));
}

/** Existe para os testes: o Map e module-level e sobrevive entre casos. */
export function clearPreviews(): void {
	previews.clear();
}
