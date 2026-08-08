<script lang="ts">
	import {
		ApiError,
		BackendApiService,
		resolveImageUrl,
		type GenreInfo,
		type MangaSearchResult,
		type SourceInfo
	} from '$lib/services/api';
	import { Search, Loader2, Compass, AlertTriangle, X } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import VolumeCard from '$lib/components/VolumeCard.svelte';
	import VolumeGridSkeleton from '$lib/components/VolumeGridSkeleton.svelte';

	let query = $state('');
	let results = $state<MangaSearchResult[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);

	let sources = $state<SourceInfo[]>([]);
	// String vazia = "Todas as fontes". E o padrao: nunca pre-seleciona uma fonte
	// especifica, senao o usuario perde resultados das outras sem perceber.
	let selectedSource = $state<string>('');

	let genres = $state<GenreInfo[]>([]);
	// Slugs marcados no filtro. Um resultado precisa ter TODOS eles.
	let selectedGenres = $state<string[]>([]);
	let genreMenuOpen = $state(false);

	// Uma vez na montagem — em $effect isso reagiria a `sources`/`selectedSource`
	// e refazia a chamada em loop.
	onMount(() => {
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

		BackendApiService.getGenres()
			.then((res) => {
				genres = res;
			})
			// Sem a lista o filtro some, mas a busca continua funcionando.
			.catch((err) => console.error('Falha ao carregar gêneros', err));

		// Chegou de um chip de genero na pagina do manga.
		const fromUrl = page.url.searchParams.get('genre');
		if (fromUrl) selectedGenres = [fromUrl];
	});

	const genreLabels = $derived(Object.fromEntries(genres.map((g) => [g.slug, g.label])));

	function toggleGenre(slug: string) {
		selectedGenres = selectedGenres.includes(slug)
			? selectedGenres.filter((s) => s !== slug)
			: [...selectedGenres, slug];
	}

	/**
	 * Filtro aplicado no cliente sobre o que a busca devolveu.
	 *
	 * As fontes nao aceitam filtro de genero na query de busca, e varias nem
	 * mandam genero no resultado — por isso o filtro so esconde quem declara
	 * generos e nao bate. Um resultado sem genero nenhum continua visivel, senao
	 * o MangaLivre (que so devolve titulo e capa na busca) sumiria inteiro.
	 */
	const visibleResults = $derived(
		selectedGenres.length === 0
			? results
			: results.filter((r) => {
					const own = r.genres ?? [];
					if (own.length === 0) return true;
					return selectedGenres.every((slug) => own.includes(slug));
				})
	);

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

	<!-- Filtro de categorias -->
	{#if genres.length > 0}
		<div class="mb-8">
			<div class="mb-3 flex flex-wrap items-center gap-3">
				<button
					type="button"
					onclick={() => (genreMenuOpen = !genreMenuOpen)}
					class="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-sm font-bold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
				>
					Categorias{selectedGenres.length > 0 ? ` (${selectedGenres.length})` : ''}
				</button>

				{#each selectedGenres as slug (slug)}
					<button
						type="button"
						onclick={() => toggleGenre(slug)}
						class="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-foreground)]"
						title="Remover filtro"
					>
						{genreLabels[slug] ?? slug}
						<X class="h-3 w-3" />
					</button>
				{/each}

				{#if selectedGenres.length > 0}
					<button
						type="button"
						onclick={() => (selectedGenres = [])}
						class="text-xs font-bold text-[var(--text-muted)] underline transition-colors hover:text-[var(--accent)]"
					>
						Limpar
					</button>
				{/if}
			</div>

			{#if genreMenuOpen}
				<div
					class="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
				>
					{#each genres as genre (genre.slug)}
						<button
							type="button"
							onclick={() => toggleGenre(genre.slug)}
							class={[
								'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
								selectedGenres.includes(genre.slug)
									? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
									: 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
							].join(' ')}
						>
							{genre.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

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
	{:else if visibleResults.length > 0}
		<section aria-labelledby="resultados">
			<div class="mb-5 flex items-baseline justify-between border-b border-[var(--border)] pb-3">
				<h2 id="resultados" class="text-lg tracking-wide text-[var(--text-primary)] uppercase">
					Resultados
				</h2>
				<span class="kicker tabular">
					{visibleResults.length} título{visibleResults.length === 1 ? '' : 's'}
				</span>
			</div>

			<div
				class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
			>
				{#each visibleResults as result, i (result.source + result.source_id)}
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
	{:else if results.length > 0}
		<!-- Houve resultados, mas o filtro de generos zerou a lista: e um estado
		     diferente de "a busca nao achou nada" e pede outra saida. -->
		<div class="registration halftone border border-[var(--rule)] px-6 py-20 text-center">
			<p class="kicker mb-5">Filtro sem correspondência</p>
			<h2 class="masthead mx-auto max-w-xl text-balance text-[var(--text-primary)]">
				Nenhum resultado com as categorias selecionadas
			</h2>
			<p class="mx-auto mt-5 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
				Remova alguma categoria para ver os {results.length} título{results.length === 1 ? '' : 's'} encontrado{results.length ===
				1
					? ''
					: 's'}.
			</p>
		</div>
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
