<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Manga } from '$lib/stores/manga.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		entry: Manga;
	}

	let { entry }: Props = $props();

	let imageLoaded = $state(false);
	let imageError = $state(false);

	const readingStatusLabel = $derived.by(() => {
		if (entry.progress >= 100) return 'Concluído';
		if (entry.progress > 0 || entry.lastChapterId) return 'Lendo';
		return 'Biblioteca';
	});

	const readingStatusKanji = $derived.by(() => {
		if (entry.progress >= 100) return '完読';
		if (entry.progress > 0 || entry.lastChapterId) return '読中';
		return '蔵書';
	});
</script>

<!--
	VolumeCard — Metáfora visual de um volume físico encadernado:
	- Aspect Ratio 2:3 padrão de encadernação japonesa.
	- Relevo de lombada à esquerda (.volume) com sombreamento realista de papel.
	- Faixa OBI (.obi) na parte inferior com metadados e progresso da leitura.
	- Título vertical (tategaki) com estética kanji de fallback caso a capa falhe.
-->
<a
	href={resolve('/manga/[source]/[id]', { source: entry.source, id: entry.id })}
	class="group relative block w-full select-none"
>
	<div
		class="volume registration relative aspect-[2/3] w-full overflow-hidden border border-[var(--rule)] bg-[var(--bg-secondary)] shadow-md transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-[var(--accent)] group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.4)]"
	>
		<!-- Capa do Mangá ou Fallback Tipográfico Tategaki -->
		{#if entry.coverUrl && !imageError}
			<img
				src={entry.coverUrl}
				alt={entry.title}
				loading="lazy"
				class={cn(
					'h-full w-full object-cover transition-all duration-500 group-hover:scale-105',
					imageLoaded ? 'opacity-100' : 'opacity-0'
				)}
				onload={() => (imageLoaded = true)}
				onerror={() => (imageError = true)}
			/>
		{/if}

		{#if !entry.coverUrl || imageError || !imageLoaded}
			<div
				class={cn(
					'halftone absolute inset-0 flex flex-col justify-between bg-[var(--bg-secondary)] p-4',
					imageLoaded && !imageError ? 'hidden' : 'flex'
				)}
			>
				<div class="flex items-start justify-between">
					<span class="hanko text-[0.5rem]">{entry.source.toUpperCase()}</span>
					<span
						class="tategaki text-[0.625rem] font-bold tracking-widest text-[var(--text-muted)] opacity-60"
					>
						日本漫画
					</span>
				</div>

				<div class="my-auto py-2">
					<h3
						class="line-clamp-3 font-serif text-sm font-black tracking-tight text-[var(--text-primary)] uppercase"
					>
						{entry.title}
					</h3>
					{#if entry.author}
						<span class="mt-1 block font-mono text-[0.625rem] font-medium text-[var(--text-muted)]">
							{entry.author}
						</span>
					{/if}
				</div>

				<div
					class="flex items-center justify-between text-[0.5625rem] font-bold tracking-wider text-[var(--text-muted)] uppercase"
				>
					<span>VOLUME</span>
					<span>HIRAKU</span>
				</div>
			</div>
		{/if}

		<!-- Selo Hanko de Status no Topo Direito -->
		<div class="absolute top-2 right-2 z-10">
			<span class="hanko text-[0.5rem] shadow-lg">{readingStatusKanji}</span>
		</div>

		<!-- Faixa OBI (Obi-band) no rodapé da capa -->
		<div class="obi absolute bottom-0 left-0 w-full p-2 text-[var(--text-primary)]">
			<div class="flex items-center justify-between">
				<span class="line-clamp-1 text-[0.625rem] font-black tracking-wider uppercase">
					{entry.title}
				</span>
			</div>

			<div
				class="mt-1 flex items-center justify-between font-mono text-[0.5625rem] text-[var(--text-muted)]"
			>
				<span>{readingStatusLabel}</span>
				{#if entry.lastChapterLabel}
					<span class="font-bold text-[var(--accent)]">{entry.lastChapterLabel}</span>
				{:else if entry.lastReadPage > 0}
					<span class="font-bold text-[var(--accent)]">PÁG. {entry.lastReadPage}</span>
				{/if}
			</div>

			{#if entry.progress !== undefined && entry.progress > 0}
				<div class="mt-1 h-0.5 w-full overflow-hidden bg-[var(--rule)]">
					<div class="h-full bg-[var(--accent)]" style="width: {entry.progress}%"></div>
				</div>
			{/if}
		</div>
	</div>
</a>
