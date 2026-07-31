<script lang="ts">
	import {
		ApiError,
		BackendApiService,
		resolveImageUrl,
		type MangaSearchResult,
		type SourceInfo
	} from '$lib/services/api';
	import { Search, Loader2, BookOpen } from 'lucide-svelte';
	import { resolve } from '$app/paths';

	let query = $state('');
	let results = $state<MangaSearchResult[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);

	let sources = $state<SourceInfo[]>([]);
	let selectedSource = $state<string>('');

	// Load sources on mount
	$effect(() => {
		BackendApiService.getSources()
			.then((res) => {
				sources = res;
				if (res.length > 0 && !selectedSource) {
					selectedSource = res[0].id;
				}
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
</script>

<main class="mx-auto max-w-7xl px-6 py-12 pb-24 text-[var(--text-primary)]">
	<header class="mb-12">
		<h1 class="font-display mb-2 text-4xl font-bold text-[var(--accent)] md:text-5xl">Catálogo</h1>
		<p class="text-lg text-[var(--text-secondary)]">Busque mangás em fontes externas.</p>
	</header>

	<form onsubmit={performSearch} class="mb-12 flex flex-col items-center gap-4 md:flex-row">
		<div class="group relative w-full flex-1">
			<Search
				class="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent)]"
			/>
			<input
				type="text"
				bind:value={query}
				placeholder="Buscar mangá..."
				class="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--bg-secondary)] py-3 pr-4 pl-12 text-lg transition-all focus:border-[var(--accent)] focus:outline-none"
			/>
		</div>
		<select
			bind:value={selectedSource}
			class="h-full w-full rounded-xl border-2 border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-lg focus:border-[var(--accent)] focus:outline-none md:w-48"
		>
			<option value="">Todas as fontes</option>
			{#each sources as source (source.id)}
				<option value={source.id}>{source.name}</option>
			{/each}
		</select>
		<button type="submit" disabled={isLoading} class="btn-primary w-full py-3 md:w-auto">
			{#if isLoading}
				<Loader2 class="h-6 w-6 animate-spin" />
			{:else}
				Buscar
			{/if}
		</button>
	</form>

	{#if error}
		<div class="rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-red-500">
			{error}
		</div>
	{/if}

	{#if results.length > 0}
		<div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{#each results as result (result.source + result.source_id)}
				<div class="group relative cursor-pointer">
					<a href={resolve(`/manga/${result.source}/${result.source_id}`)}>
						<div
							class="card relative mb-3 aspect-[3/4] transition-transform duration-300 group-hover:-translate-y-2"
						>
							{#if result.cover_url}
								<img
									src={resolveImageUrl(result.cover_url)}
									alt="Capa"
									loading="lazy"
									class="h-full w-full object-cover"
								/>
							{:else}
								<div class="flex h-full w-full items-center justify-center">
									<BookOpen class="h-8 w-8 text-[var(--text-muted)]" />
								</div>
							{/if}
							<div
								class="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent pb-4 opacity-0 transition-opacity group-hover:opacity-100"
							>
								<span
									class="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[10px] font-black tracking-widest text-white uppercase"
								>
									<BookOpen class="h-3 w-3" /> VER DETALHES
								</span>
							</div>
						</div>
						<h4
							class="font-body line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-[var(--accent)]"
						>
							{result.title}
						</h4>
						<p class="mt-0.5 text-[10px] text-[var(--text-muted)] uppercase">
							{sources.find((s) => s.id === result.source)?.name || result.source}
						</p>
					</a>
				</div>
			{/each}
		</div>
	{:else if hasSearched && !isLoading && !error}
		<div class="py-12 text-center text-[var(--text-muted)]">
			Nenhum resultado encontrado para "{query}".
		</div>
	{/if}
</main>
