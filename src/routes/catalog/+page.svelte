<script lang="ts">
	import {
		ApiError,
		BackendApiService,
		resolveImageUrl,
		type MangaSearchResult,
		type SourceInfo
	} from '$lib/services/api';
	import { Search, Loader2, Compass, AlertTriangle } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import VolumeCard from '$lib/components/VolumeCard.svelte';
	import VolumeGridSkeleton from '$lib/components/VolumeGridSkeleton.svelte';

	let query = $state('');
	let results = $state<MangaSearchResult[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);

	let sources = $state<SourceInfo[]>([]);
	let selectedSource = $state<string>('');

	// Carrega as fontes disponiveis assim que a tela monta.
	$effect(() => {
		BackendApiService.getSources()
			.then((res) => {
				sources = res;
			})
			.catch((err) => {
				console.error(err);
				error =
					err instanceof ApiError
						? err.message
						: 'Falha ao carregar as fontes. O backend está rodando?';
			});
	});

	async function performSearch(e: Event) {
		e.preventDefault();
		if (!query || query.trim().length < 2) return;

		isLoading = true;
		error = null;
		hasSearched = true;

		try {
			results = await BackendApiService.search(query.trim(), selectedSource || undefined);
		} catch (err) {
			console.error(err);
			results = [];
			error =
				err instanceof ApiError
					? err.message
					: 'Falha ao buscar mangás. Verifique se o backend está rodando.';
		} finally {
			isLoading = false;
		}
	}

	function sourceName(id: string): string {
		return sources.find((s) => s.id === id)?.name ?? id;
	}
</script>

<main class="mx-auto max-w-[100rem] px-6 py-10 pb-28 md:px-10 md:py-14 xl:pb-14">
	<PageHeader
		kicker="Fontes externas · {sources.length || '—'} disponíve{sources.length === 1 ? 'l' : 'is'}"
		title="Catálogo"
		furigana="さがす"
		lede="Busque um título nas fontes conectadas e adicione à sua estante em um toque."
	>
		{#snippet aside()}
			<form onsubmit={performSearch} class="flex w-full items-end gap-4 lg:w-auto">
				<div class="group relative flex-1 lg:w-72">
					<label for="catalog-search" class="kicker mb-1.5 block">Buscar</label>
					<div
						class="flex items-center gap-2 border-b border-[var(--rule)] focus-within:border-[var(--accent)]"
					>
						<Search
							class="h-4 w-4 flex-shrink-0 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent)]"
							aria-hidden="true"
						/>
						<input
							id="catalog-search"
							type="search"
							bind:value={query}
							placeholder="Título…"
							class="w-full border-0 bg-transparent py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
						/>
					</div>
				</div>

				<div class="w-36">
					<label for="catalog-source" class="kicker mb-1.5 block">Fonte</label>
					<select id="catalog-source" bind:value={selectedSource} class="select">
						<option value="">Todas</option>
						{#each sources as source (source.id)}
							<option value={source.id}>{source.name}</option>
						{/each}
					</select>
				</div>

				<button type="submit" disabled={isLoading} class="btn-primary flex-shrink-0">
					{#if isLoading}
						<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
					{:else}
						<Search class="h-4 w-4" aria-hidden="true" />
					{/if}
					<span class="hidden sm:inline">Buscar</span>
				</button>
			</form>
		{/snippet}
	</PageHeader>

	{#if error}
		<div
			class="registration mb-10 flex items-start gap-3 border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-5 py-4"
		>
			<AlertTriangle class="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent)]" aria-hidden="true" />
			<p class="text-sm text-[var(--text-secondary)]">{error}</p>
		</div>
	{/if}

	{#if isLoading}
		<VolumeGridSkeleton count={10} />
	{:else if results.length > 0}
		<section aria-labelledby="resultados">
			<div class="mb-5 flex items-baseline justify-between border-b border-[var(--border)] pb-3">
				<h2 id="resultados" class="text-lg tracking-wide text-[var(--text-primary)] uppercase">
					Resultados
				</h2>
				<span class="kicker tabular">
					{results.length} título{results.length === 1 ? '' : 's'}
				</span>
			</div>

			<div
				class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
			>
				{#each results as result, i (result.source + result.source_id)}
					<VolumeCard
						href={resolve(`/manga/${result.source}/${result.source_id}`)}
						title={result.title}
						coverUrl={resolveImageUrl(result.cover_url)}
						footnote={sourceName(result.source)}
						action="Ver detalhes"
						eager={i < 6}
					/>
				{/each}
			</div>
		</section>
	{:else if hasSearched && !error}
		<div class="registration halftone border border-[var(--rule)] px-6 py-20 text-center">
			<p class="kicker mb-5">Sem correspondência</p>
			<h2 class="masthead mx-auto max-w-xl text-balance text-[var(--text-primary)]">
				Nada encontrado para "{query}"
			</h2>
			<p class="mx-auto mt-5 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
				Tente outro termo ou troque a fonte selecionada.
			</p>
		</div>
	{:else}
		<div
			class="registration halftone border border-dashed border-[var(--rule)] px-6 py-20 text-center"
		>
			<Compass class="mx-auto mb-5 h-8 w-8 text-[var(--text-muted)]" aria-hidden="true" />
			<h2 class="masthead mx-auto max-w-xl text-balance text-[var(--text-primary)]">
				O que você quer ler hoje?
			</h2>
			<p class="mx-auto mt-5 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
				Digite um título acima para buscar nas fontes conectadas.
			</p>
		</div>
	{/if}
</main>
