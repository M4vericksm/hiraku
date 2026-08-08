<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Cabecalho de tela: kicker tecnico, masthead condensado e a regra dupla que
	 * assina o layout. `aside` recebe os controles (busca, filtros) e desce para
	 * baixo do titulo no mobile.
	 */
	interface Props {
		kicker: string;
		title: string;
		/** Tipo vertical japones ao lado do masthead. Decorativo. */
		furigana?: string;
		lede?: string;
		aside?: Snippet;
	}

	let { kicker, title, furigana, lede, aside }: Props = $props();
</script>

<header class="mb-10">
	<div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
		<div class="flex items-start gap-5">
			<div>
				<p class="kicker mb-3">{kicker}</p>
				<h1 class="masthead text-balance text-[var(--text-primary)]">{title}</h1>
				{#if lede}
					<p class="mt-4 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">{lede}</p>
				{/if}
			</div>
			{#if furigana}
				<span
					aria-hidden="true"
					class="tategaki mt-9 hidden text-[0.625rem] leading-none text-[var(--accent)] select-none sm:block"
				>
					{furigana}
				</span>
			{/if}
		</div>

		{#if aside}
			<div class="w-full lg:w-auto lg:pb-2">{@render aside()}</div>
		{/if}
	</div>

	<div class="rule-double mt-8"></div>
</header>
