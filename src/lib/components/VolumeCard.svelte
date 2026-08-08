<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/**
	 * A capa apresentada como um volume encadernado: lombada na borda esquerda e
	 * obi (a faixa de papel) na base carregando o progresso ou a fonte. Usado na
	 * Biblioteca e no Catalogo para os dois grids ficarem identicos.
	 *
	 * `href` deve chegar ja resolvido por `resolve()` de `$app/paths`.
	 */
	interface Props {
		href: string;
		title: string;
		coverUrl?: string;
		/** Texto da obi. Sem valor, a faixa nao aparece. */
		obi?: string;
		/** 0–100. Desenha a barra sobre a obi. */
		progress?: number;
		/** Etiqueta pequena sob o titulo (nome da fonte, por exemplo). */
		footnote?: string;
		/** Chamada da acao no hover ("Ler", "Ver detalhes"). */
		action?: string;
		/** Controle sobreposto no canto (remover da biblioteca, por exemplo). */
		overlay?: Snippet;
		eager?: boolean;
	}

	let {
		href,
		title,
		coverUrl,
		obi,
		progress = 0,
		footnote,
		action = 'Ler',
		overlay,
		eager = false
	}: Props = $props();

	let loaded = $state(false);
	let failed = $state(false);

	const showArt = $derived(!!coverUrl && !failed);
</script>

<article class="group relative">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- o chamador ja resolve o href -->
	<a {href} class="block focus-visible:outline-offset-4">
		<div class="volume relative aspect-[2/3] rounded-[var(--radius)]">
			{#if showArt}
				<img
					src={coverUrl}
					alt="Capa de {title}"
					loading={eager ? 'eager' : 'lazy'}
					decoding="async"
					onload={() => (loaded = true)}
					onerror={() => (failed = true)}
					class={cn(
						'h-full w-full object-cover transition-opacity duration-500',
						loaded ? 'opacity-100' : 'opacity-0'
					)}
				/>
			{:else}
				<!-- Sem arte, a capa vira lombada: o titulo corre na vertical. -->
				<div class="halftone flex h-full w-full items-center justify-center overflow-hidden p-3">
					<span
						class="tategaki line-clamp-1 text-[0.625rem] font-bold text-[var(--text-muted)] uppercase"
					>
						{title}
					</span>
				</div>
			{/if}

			<!-- Chamada da acao: aparece no hover e no foco pelo teclado. -->
			<div
				class="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--overlay)] opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
			>
				<span
					class="border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[0.5625rem] font-bold tracking-[0.2em] text-[var(--accent-foreground)] uppercase"
				>
					{action}
				</span>
			</div>

			{#if obi}
				<div class="obi absolute bottom-0 left-0 w-full">
					{#if progress > 0}
						<div class="h-[3px] w-full bg-[var(--bg-accent)]">
							<div
								class="h-full bg-[var(--accent)]"
								style="width: {Math.min(progress, 100)}%"
							></div>
						</div>
					{/if}
					<p class="truncate px-2 py-1.5 text-[var(--text-secondary)]">{obi}</p>
				</div>
			{/if}
		</div>

		<h3
			class="mt-2.5 line-clamp-2 text-[0.8125rem] leading-snug font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]"
		>
			{title}
		</h3>
		{#if footnote}
			<p
				class="mt-0.5 text-[0.5625rem] font-bold tracking-[0.18em] text-[var(--text-muted)] uppercase"
			>
				{footnote}
			</p>
		{/if}
	</a>

	{#if overlay}
		{@render overlay()}
	{/if}
</article>
