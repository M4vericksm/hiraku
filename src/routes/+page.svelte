<script lang="ts">
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { Plus, Search, Filter, BookOpen, Trash2, ChevronDown } from 'lucide-svelte';
	import BulkImportModal from '$lib/components/BulkImportModal.svelte';
	import { base } from '$app/paths';

	type SortKey = 'addedAt' | 'title' | 'progress' | 'lastReadAt';
	type FilterKey = 'all' | 'reading' | 'completed' | 'unread';

	let searchQuery = $state('');
	let isImportModalOpen = $state(false);
	let deletingId = $state<string | null>(null);
	let sortBy = $state<SortKey>('addedAt');
	let filterBy = $state<FilterKey>('all');
	let filterMenuOpen = $state(false);

	const SORT_LABELS: Record<SortKey, string> = {
		addedAt: 'Adicionado',
		title: 'Título',
		progress: 'Progresso',
		lastReadAt: 'Última leitura',
	};

	const FILTER_LABELS: Record<FilterKey, string> = {
		all: 'Todos',
		reading: 'Em andamento',
		completed: 'Concluídos',
		unread: 'Não iniciados',
	};

	const filteredLibrary = $derived(() => {
		let list = mangaStore.library.filter((m) =>
			m.title.toLowerCase().includes(searchQuery.toLowerCase())
		);

		if (filterBy === 'reading') list = list.filter((m) => m.progress > 0 && m.progress < 100);
		else if (filterBy === 'completed') list = list.filter((m) => m.progress >= 100);
		else if (filterBy === 'unread') list = list.filter((m) => m.progress === 0);

		list = [...list].sort((a, b) => {
			if (sortBy === 'title') return a.title.localeCompare(b.title);
			if (sortBy === 'progress') return b.progress - a.progress;
			if (sortBy === 'lastReadAt') {
				return (b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0)
					- (a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0);
			}
			return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
		});

		return list;
	});

	function handleImport() {
		isImportModalOpen = true;
	}

	function requestDelete(id: string, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (deletingId === id) {
			mangaStore.removeManga(id);
			deletingId = null;
		} else {
			deletingId = id;
			setTimeout(() => { if (deletingId === id) deletingId = null; }, 3000);
		}
	}
</script>

<BulkImportModal isOpen={isImportModalOpen} onClose={() => (isImportModalOpen = false)} />

<main class="max-w-7xl mx-auto px-6 py-12 pb-24 text-[var(--text-primary)] font-body">
	<header class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
		<div>
			<h1 class="text-4xl md:text-5xl mb-2 text-[var(--accent)] font-display font-bold">Hiraku</h1>
			<p class="text-[var(--text-secondary)] text-lg">Sua biblioteca pessoal de mangás.</p>
		</div>

		<div class="flex items-center gap-3">
			<div class="relative group">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Buscar na biblioteca..."
					class="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius)] pl-10 pr-4 py-2 w-full md:w-64 focus:outline-none focus:border-[var(--accent)] transition-all"
				/>
			</div>
			<div class="relative">
				<button
					onclick={() => (filterMenuOpen = !filterMenuOpen)}
					class="p-2 border border-[var(--border)] rounded-[var(--radius)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-1.5 px-3"
				>
					<Filter class="w-4 h-4" />
					<span class="text-xs font-bold hidden sm:block">{filterBy !== 'all' || sortBy !== 'addedAt' ? '·' : ''}</span>
					<ChevronDown class="w-3 h-3 opacity-50" />
				</button>
				{#if filterMenuOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute right-0 top-full mt-2 w-56 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl z-50 p-3 flex flex-col gap-1"
						onmouseleave={() => (filterMenuOpen = false)}
					>
						<p class="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] px-2 mb-1">Ordenar</p>
						{#each Object.entries(SORT_LABELS) as [key, label]}
							<button
								onclick={() => { sortBy = key as SortKey; }}
								class="text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--bg-accent)]/10 transition-colors flex items-center justify-between {sortBy === key ? 'text-[var(--accent)] font-bold' : ''}"
							>
								{label}
								{#if sortBy === key}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>{/if}
							</button>
						{/each}
						<div class="border-t border-[var(--border)] my-1"></div>
						<p class="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] px-2 mb-1">Filtrar</p>
						{#each Object.entries(FILTER_LABELS) as [key, label]}
							<button
								onclick={() => { filterBy = key as FilterKey; }}
								class="text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--bg-accent)]/10 transition-colors flex items-center justify-between {filterBy === key ? 'text-[var(--accent)] font-bold' : ''}"
							>
								{label}
								{#if filterBy === key}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</header>

	{#if mangaStore.isLoading}
		<div class="flex items-center justify-center py-24">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]"></div>
		</div>
	{:else if mangaStore.library.length === 0}
		<div class="flex flex-col items-center justify-center py-24 px-6 text-center border-2 border-dashed border-[var(--border)] rounded-2xl">
			<div class="w-20 h-20 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mb-6">
				<BookOpen class="w-10 h-10 text-[var(--text-muted)]" />
			</div>
			<h2 class="text-2xl mb-2">Sua biblioteca está vazia</h2>
			<p class="text-[var(--text-secondary)] max-w-md mb-8">
				Importe seus arquivos PDF para começar a ler com a melhor experiência.
			</p>
			<button onclick={handleImport} class="btn-primary flex items-center gap-2">
				<Plus class="w-5 h-5" />
				Importar Primeiro Mangá
			</button>
		</div>
	{:else}
		{#if mangaStore.recentManga.length > 0}
			<section class="mb-16">
				<h3 class="text-xl mb-6 opacity-60 uppercase tracking-widest text-sm">Continuar Lendo</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					{#each mangaStore.recentManga.slice(0, 2) as manga}
						<a href="{base}/manga/{manga.id}" class="card flex h-48 group cursor-pointer hover:border-[var(--accent)] transition-colors">
							<div class="w-32 bg-[var(--bg-accent)] flex-shrink-0 relative">
								{#if manga.coverUrl}
									<img src={manga.coverUrl} alt={manga.title} class="w-full h-full object-cover" />
								{/if}
								<div class="absolute bottom-0 left-0 w-full h-1.5 bg-black/20">
									<div class="h-full bg-[var(--accent)]" style="width: {manga.progress}%"></div>
								</div>
							</div>
							<div class="p-6 flex flex-col justify-between flex-grow">
								<div>
									<h4 class="text-xl mb-1 line-clamp-1">{manga.title}</h4>
									<p class="text-[var(--text-secondary)] text-sm line-clamp-1">{manga.author || 'Autor desconhecido'}</p>
								</div>
								<div class="flex items-center justify-between mt-4">
									<span class="text-[var(--text-muted)] text-sm">Pág. {manga.lastReadPage} / {manga.totalPage}</span>
									<div class="text-[var(--accent)] group-hover:translate-x-1 transition-transform">
										<BookOpen class="w-6 h-6" />
									</div>
								</div>
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<h3 class="text-xl mb-6 opacity-60 uppercase tracking-widest text-sm">Minha Biblioteca</h3>
			<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
				{#each filteredLibrary() as manga}
					<div class="group cursor-pointer relative">
						<a href="{base}/manga/{manga.id}">
							<div class="aspect-[3/4] card mb-3 relative group-hover:-translate-y-2 transition-transform duration-300">
								{#if manga.coverUrl}
									<img src={manga.coverUrl} alt={manga.title} class="w-full h-full object-cover" />
								{/if}
								<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
									<BookOpen class="w-10 h-10 text-white" />
								</div>
								{#if manga.progress > 0}
									<div class="absolute bottom-0 left-0 w-full h-1 bg-black/40">
										<div class="h-full bg-[var(--accent)]" style="width: {manga.progress}%"></div>
									</div>
								{/if}
							</div>
							<h4 class="text-sm font-medium line-clamp-2 leading-snug group-hover:text-[var(--accent)] transition-colors font-body">{manga.title}</h4>
						</a>
						<button
							onclick={(e) => requestDelete(manga.id, e)}
							title={deletingId === manga.id ? 'Confirmar exclusão' : 'Remover da biblioteca'}
							class={[
								'absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center transition-all z-10',
								deletingId === manga.id
									? 'bg-red-500 text-white opacity-100 scale-110'
									: 'bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500'
							].join(' ')}
						>
							<Trash2 class="w-3.5 h-3.5" />
						</button>
					</div>
				{/each}

				<button onclick={handleImport} class="aspect-[3/4] border-2 border-dashed border-[var(--border)] rounded-[var(--radius)] flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all group">
					<Plus class="w-8 h-8 group-hover:scale-110 transition-transform" />
					<span class="text-xs font-bold uppercase tracking-tighter">Importar PDF</span>
				</button>
			</div>
		</section>
	{/if}

	<button onclick={handleImport} class="fixed bottom-8 right-8 w-16 h-16 bg-[var(--accent)] text-[var(--accent-foreground)] rounded-full shadow-2xl flex items-center justify-center md:hidden active:scale-90 transition-transform z-50">
		<Plus class="w-8 h-8" />
	</button>
</main>
