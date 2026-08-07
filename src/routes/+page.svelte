<script lang="ts">
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import { Search, SlidersHorizontal, Trash2, Compass, ArrowRight, X } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import VolumeCard from '$lib/components/VolumeCard.svelte';
	import VolumeGridSkeleton from '$lib/components/VolumeGridSkeleton.svelte';

	type SortKey = 'addedAt' | 'title' | 'progress' | 'lastReadAt';
	type FilterKey = 'all' | 'reading' | 'completed' | 'unread';

	let searchQuery = $state('');
	let deletingId = $state<string | null>(null);
	let sortBy = $state<SortKey>('addedAt');
	let filterBy = $state<FilterKey>('all');
	let filterMenuOpen = $state(false);
	let filterMenu = $state<HTMLDivElement | null>(null);

	const SORT_LABELS: Record<SortKey, string> = {
		addedAt: 'Adicionado',
		title: 'Título',
		progress: 'Progresso',
		lastReadAt: 'Última leitura'
	};

	const FILTER_LABELS: Record<FilterKey, string> = {
		all: 'Todos',
		reading: 'Em andamento',
		completed: 'Concluídos',
		unread: 'Não iniciados'
	};

	const isFiltered = $derived(filterBy !== 'all' || sortBy !== 'addedAt');

	const filteredLibrary = $derived.by(() => {
		const term = searchQuery.trim().toLowerCase();
		let list = mangaStore.library.filter((m) => m.title.toLowerCase().includes(term));

		if (filterBy === 'reading') list = list.filter((m) => m.progress > 0 && m.progress < 100);
		else if (filterBy === 'completed') list = list.filter((m) => m.progress >= 100);
		else if (filterBy === 'unread') list = list.filter((m) => m.progress === 0);

		return [...list].sort((a, b) => {
			if (sortBy === 'title') return a.title.localeCompare(b.title, 'pt-BR');
			if (sortBy === 'progress') return b.progress - a.progress;
			if (sortBy === 'lastReadAt') {
				return (
					(b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0) -
					(a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0)
				);
			}
			return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
		});
	});

	const reading = $derived(mangaStore.recentManga.slice(0, 3));

	// Retoma no ultimo capitulo lido; sem historico, cai na pagina do manga.
	function resumeHref(manga: Manga) {
		return manga.lastChapterId
			? resolve(`/reader/${manga.source}/${manga.id}/${manga.lastChapterId}`)
			: resolve(`/manga/${manga.source}/${manga.id}`);
	}

	/** Texto da obi: prioriza o capitulo, cai no progresso, depois no autor. */
	function obiFor(manga: Manga): string | undefined {
		if (manga.lastChapterLabel) {
			return manga.progress > 0
				? `${manga.lastChapterLabel} · ${manga.progress}%`
				: manga.lastChapterLabel;
		}
		if (manga.progress > 0) return `${manga.progress}% lido`;
		return undefined;
	}

	function requestDelete(source: string, id: string, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (deletingId === id) {
			mangaStore.removeManga(id, source);
			deletingId = null;
		} else {
			deletingId = id;
			setTimeout(() => {
				if (deletingId === id) deletingId = null;
			}, 3000);
		}
	}

	// O menu antes fechava so no mouseleave, o que travava no toque e no teclado.
	function handleWindowPointerDown(e: PointerEvent) {
		if (!filterMenuOpen) return;
		if (filterMenu && !filterMenu.contains(e.target as Node)) filterMenuOpen = false;
	}

	function handleWindowKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && filterMenuOpen) filterMenuOpen = false;
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeyDown} />

<main class="mx-auto max-w-[100rem] px-6 py-10 pb-28 md:px-10 md:py-14 xl:pb-14">
	<PageHeader
		kicker="Acervo local · {mangaStore.library.length} título{mangaStore.library.length === 1
			? ''
			: 's'}"
		title="Biblioteca"
		furigana="ほんだな"
	>
		{#snippet aside()}
			<div class="flex items-end gap-4">
				<div class="group relative flex-1 lg:w-72">
					<label for="library-search" class="kicker mb-1.5 block">Buscar</label>
					<div
						class="flex items-center gap-2 border-b border-[var(--rule)] focus-within:border-[var(--accent)]"
					>
						<Search
							class="h-4 w-4 flex-shrink-0 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent)]"
							aria-hidden="true"
						/>
						<input
							id="library-search"
							type="search"
							bind:value={searchQuery}
							placeholder="Título…"
							class="w-full border-0 bg-transparent py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
						/>
						{#if searchQuery}
							<button
								type="button"
								onclick={() => (searchQuery = '')}
								class="p-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
							>
								<X class="h-3.5 w-3.5" />
								<span class="sr-only">Limpar busca</span>
							</button>
						{/if}
					</div>
				</div>

				<div class="relative" bind:this={filterMenu}>
					<button
						type="button"
						onclick={() => (filterMenuOpen = !filterMenuOpen)}
						aria-expanded={filterMenuOpen}
						aria-haspopup="true"
						class={cn(
							'flex items-center gap-2 border px-3 py-2.5 text-[0.5625rem] font-bold tracking-[0.18em] uppercase transition-colors',
							isFiltered
								? 'border-[var(--accent)] text-[var(--accent)]'
								: 'border-[var(--rule)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
						)}
					>
						<SlidersHorizontal class="h-3.5 w-3.5" aria-hidden="true" />
						<span class="hidden sm:inline">
							{isFiltered ? FILTER_LABELS[filterBy] : 'Ordenar'}
						</span>
					</button>

					{#if filterMenuOpen}
						<div
							class="absolute top-full right-0 z-50 mt-2 flex w-60 flex-col border border-[var(--rule)] bg-[var(--bg-secondary)] p-2 shadow-2xl"
						>
							<p class="kicker px-2 py-2">Ordenar por</p>
							{#each Object.entries(SORT_LABELS) as [key, label] (key)}
								<button
									type="button"
									onclick={() => (sortBy = key as SortKey)}
									class={cn(
										'flex items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:text-[var(--accent)]',
										sortBy === key
											? 'font-semibold text-[var(--accent)]'
											: 'text-[var(--text-secondary)]'
									)}
								>
									{label}
									{#if sortBy === key}<span class="h-1.5 w-1.5 bg-[var(--accent)]"></span>{/if}
								</button>
							{/each}

							<div class="my-2 border-t border-[var(--border)]"></div>

							<p class="kicker px-2 py-2">Filtrar</p>
							{#each Object.entries(FILTER_LABELS) as [key, label] (key)}
								<button
									type="button"
									onclick={() => (filterBy = key as FilterKey)}
									class={cn(
										'flex items-center justify-between px-2 py-2 text-left text-sm transition-colors hover:text-[var(--accent)]',
										filterBy === key
											? 'font-semibold text-[var(--accent)]'
											: 'text-[var(--text-secondary)]'
									)}
								>
									{label}
									{#if filterBy === key}<span class="h-1.5 w-1.5 bg-[var(--accent)]"></span>{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/snippet}
	</PageHeader>

	{#if mangaStore.isLoading}
		<VolumeGridSkeleton count={10} />
	{:else if mangaStore.library.length === 0}
		<!-- Estado vazio como uma faixa de obi em branco: convida sem enfeitar. -->
		<div class="registration halftone border border-[var(--rule)] px-6 py-20 text-center">
			<p class="kicker mb-5">Nada encadernado ainda</p>
			<h2 class="masthead mx-auto max-w-xl text-balance text-[var(--text-primary)]">
				Sua estante está vazia
			</h2>
			<p class="mx-auto mt-5 mb-9 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
				Busque um título no catálogo e ele passa a viver aqui — com progresso e capítulos offline
				guardados só no seu dispositivo.
			</p>
			<a href={resolve('/catalog')} class="btn-primary">
				<Compass class="h-4 w-4" aria-hidden="true" />
				Explorar catálogo
			</a>
		</div>
	{:else}
		{#if reading.length > 0}
			<section class="mb-16" aria-labelledby="continuar">
				<div class="mb-5 flex items-baseline justify-between border-b border-[var(--border)] pb-3">
					<h2 id="continuar" class="text-lg tracking-wide text-[var(--text-primary)] uppercase">
						Continuar lendo
					</h2>
					<span class="kicker">Retomar de onde parou</span>
				</div>

				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each reading as manga (manga.id + manga.source)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resumeHref() ja aplica resolve() -->
						<a
							href={resumeHref(manga)}
							class="group flex items-stretch gap-0 border border-[var(--border)] bg-[var(--bg-secondary)] transition-colors hover:border-[var(--accent)]"
						>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
							<div class="volume w-24 flex-shrink-0 sm:w-28">
								{#if manga.coverUrl}
									<img
										src={manga.coverUrl}
										alt="Capa de {manga.title}"
										class="h-full w-full object-cover"
										loading="eager"
									/>
								{:else}
									<div class="halftone h-full w-full"></div>
								{/if}
							</div>

							<div class="flex min-w-0 flex-1 flex-col justify-between p-4">
								<div class="min-w-0">
									<p class="kicker mb-2 truncate">
										{manga.lastChapterLabel || 'Começar do início'}
									</p>
									<h3
										class="line-clamp-2 text-base leading-tight font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]"
									>
										{manga.title}
									</h3>
								</div>

								<div class="mt-4">
									<div class="mb-2 flex items-end justify-between gap-2">
										<span
											class="tabular text-[0.625rem] font-bold tracking-[0.16em] text-[var(--text-muted)] uppercase"
										>
											{manga.totalPage > 0
												? `Pág. ${manga.lastReadPage}/${manga.totalPage}`
												: 'Nova leitura'}
										</span>
										<span class="folio text-[var(--accent)]" style="font-size:1.375rem">
											{manga.progress}<span class="text-[0.625rem]">%</span>
										</span>
									</div>
									<div class="h-[3px] w-full bg-[var(--bg-accent)]">
										<div
											class="h-full bg-[var(--accent)] transition-[width] duration-500"
											style="width: {Math.min(manga.progress, 100)}%"
										></div>
									</div>
								</div>
							</div>

							<div
								class="flex w-10 flex-shrink-0 items-center justify-center border-l border-[var(--border)] text-[var(--text-muted)] transition-colors group-hover:border-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-foreground)]"
							>
								<ArrowRight class="h-4 w-4" aria-hidden="true" />
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<section aria-labelledby="estante">
			<div class="mb-5 flex items-baseline justify-between border-b border-[var(--border)] pb-3">
				<h2 id="estante" class="text-lg tracking-wide text-[var(--text-primary)] uppercase">
					Estante
				</h2>
				<span class="kicker tabular">
					{filteredLibrary.length} de {mangaStore.library.length}
					{isFiltered || searchQuery ? '· filtrado' : ''}
				</span>
			</div>

			{#if filteredLibrary.length === 0}
				<div class="border border-dashed border-[var(--rule)] px-6 py-16 text-center">
					<p class="text-sm text-[var(--text-secondary)]">
						Nenhum título corresponde a esses critérios.
					</p>
					<button
						type="button"
						onclick={() => {
							searchQuery = '';
							filterBy = 'all';
							sortBy = 'addedAt';
						}}
						class="mt-5 text-[0.625rem] font-bold tracking-[0.18em] text-[var(--accent)] uppercase underline decoration-1 underline-offset-4"
					>
						Limpar filtros
					</button>
				</div>
			{:else}
				<div
					class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
				>
					{#each filteredLibrary as manga, i (manga.id + manga.source)}
						<VolumeCard
							href={resolve(`/manga/${manga.source}/${manga.id}`)}
							title={manga.title}
							coverUrl={manga.coverUrl}
							obi={obiFor(manga)}
							progress={manga.progress}
							action="Abrir"
							eager={i < 6}
						>
							{#snippet overlay()}
								<button
									type="button"
									onclick={(e) => requestDelete(manga.source, manga.id, e)}
									class={cn(
										'absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center border transition-all',
										deletingId === manga.id
											? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] opacity-100'
											: 'border-[var(--rule)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:opacity-100'
									)}
								>
									<Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
									<span class="sr-only">
										{deletingId === manga.id
											? `Confirmar remoção de ${manga.title}`
											: `Remover ${manga.title} da biblioteca`}
									</span>
								</button>
							{/snippet}
						</VolumeCard>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>
