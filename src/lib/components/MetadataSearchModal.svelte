<script lang="ts">
	import { X, Search, Loader2, Star, CheckCircle } from 'lucide-svelte';
	import { MetadataService, type MangaMetadata } from '$lib/services/metadata';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { cn } from '$lib/utils';

	let { mangaId, currentTitle, isOpen, onClose } = $props<{
		mangaId: string;
		currentTitle: string;
		isOpen: boolean;
		onClose: () => void;
	}>();

	let query = $state(currentTitle);
	let results = $state<MangaMetadata[]>([]);
	let isSearching = $state(false);
	let selected = $state<MangaMetadata | null>(null);
	let saved = $state(false);

	$effect(() => {
		if (isOpen && currentTitle) {
			query = currentTitle;
			doSearch();
		}
	});

	async function doSearch() {
		if (!query.trim()) return;
		isSearching = true;
		results = [];
		selected = null;
		results = await MetadataService.searchAniList(query.trim());
		isSearching = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') doSearch();
		if (e.key === 'Escape') onClose();
	}

	function applyMeta() {
		if (!selected) return;
		mangaStore.updateMeta(mangaId, {
			title: selected.title,
			author: selected.author,
			coverUrl: selected.coverUrl,
			description: selected.description,
			genres: selected.genres,
			status: selected.status,
			averageScore: selected.averageScore
		});
		saved = true;
		setTimeout(() => { saved = false; onClose(); }, 800);
	}

	function statusLabel(s?: string) {
		const map: Record<string, string> = {
			FINISHED: 'Finalizado',
			RELEASING: 'Em lançamento',
			HIATUS: 'Hiato',
			NOT_YET_RELEASED: 'Não lançado'
		};
		return s ? (map[s] ?? s) : '';
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-[200] flex items-center justify-center p-4">
		<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={onClose}></div>

		<div class="relative bg-[var(--bg-primary)] border border-[var(--border)] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
			<header class="flex items-center justify-between p-6 border-b border-[var(--border)]">
				<div>
					<h2 class="text-lg font-display font-bold">Buscar Metadados</h2>
					<p class="text-xs text-[var(--text-muted)] uppercase tracking-widest mt-0.5">via AniList</p>
				</div>
				<button onclick={onClose} class="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors rounded-full hover:bg-[var(--bg-secondary)]">
					<X class="w-5 h-5" />
				</button>
			</header>

			<div class="p-6 border-b border-[var(--border)]">
				<div class="flex gap-3">
					<div class="relative flex-grow">
						<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
						<input
							type="text"
							bind:value={query}
							onkeydown={handleKeydown}
							placeholder="Nome do mangá..."
							class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-all"
						/>
					</div>
					<button
						onclick={doSearch}
						disabled={isSearching}
						class="btn-primary px-5 py-3 text-sm font-bold flex items-center gap-2 rounded-xl"
					>
						{#if isSearching}
							<Loader2 class="w-4 h-4 animate-spin" />
						{:else}
							<Search class="w-4 h-4" />
						{/if}
						Buscar
					</button>
				</div>
			</div>

			<div class="flex-grow overflow-y-auto p-4 flex flex-col gap-3" style="scrollbar-width: thin;">
				{#if isSearching}
					<div class="flex items-center justify-center py-16">
						<Loader2 class="w-8 h-8 text-[var(--accent)] animate-spin" />
					</div>
				{:else if results.length === 0}
					<div class="flex flex-col items-center justify-center py-16 text-center opacity-40">
						<Search class="w-8 h-8 mb-3" />
						<p class="text-sm font-bold uppercase tracking-widest">Nenhum resultado</p>
						<p class="text-xs mt-1">Tente um título diferente</p>
					</div>
				{:else}
					{#each results as result}
						<button
							onclick={() => selected = result}
							class={cn(
								'flex gap-4 p-4 rounded-xl border text-left transition-all hover:border-[var(--accent)] group',
								selected?.id === result.id
									? 'border-[var(--accent)] bg-[var(--accent)]/5'
									: 'border-[var(--border)] bg-[var(--bg-secondary)]/40'
							)}
						>
							<img src={result.coverUrl} alt={result.title} class="w-14 h-20 object-cover rounded-lg flex-shrink-0 border border-[var(--border)]" />
							<div class="flex-grow min-w-0">
								<div class="flex items-start justify-between gap-2">
									<h3 class="font-bold text-sm leading-tight line-clamp-2">{result.title}</h3>
									{#if selected?.id === result.id}
										<CheckCircle class="w-4 h-4 text-[var(--accent)] flex-shrink-0 mt-0.5" />
									{/if}
								</div>
								{#if result.author}
									<p class="text-xs text-[var(--text-muted)] mt-1">{result.author}</p>
								{/if}
								<div class="flex flex-wrap gap-2 mt-2">
									{#if result.status}
										<span class="text-[9px] px-2 py-0.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full uppercase tracking-widest font-bold">{statusLabel(result.status)}</span>
									{/if}
									{#if result.averageScore}
										<span class="text-[9px] px-2 py-0.5 bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] rounded-full uppercase tracking-widest font-bold flex items-center gap-1">
											<Star class="w-2.5 h-2.5" />
											{result.averageScore}
										</span>
									{/if}
									{#each (result.genres ?? []).slice(0, 3) as genre}
										<span class="text-[9px] px-2 py-0.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full uppercase tracking-widest">{genre}</span>
									{/each}
								</div>
								{#if result.description}
									<p class="text-xs text-[var(--text-muted)] mt-2 line-clamp-2 leading-relaxed">{result.description.replace(/<[^>]*>/gm, '')}</p>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>

			{#if selected}
				<footer class="p-5 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 flex items-center justify-between">
					<p class="text-xs text-[var(--text-secondary)] truncate flex-grow mr-4">
						Selecionado: <span class="font-bold text-[var(--text-primary)]">{selected.title}</span>
					</p>
					<button
						onclick={applyMeta}
						class={cn('btn-primary px-6 py-2.5 text-xs font-bold uppercase tracking-widest flex items-center gap-2 flex-shrink-0 rounded-xl', saved && 'opacity-75')}
					>
						{#if saved}
							<CheckCircle class="w-4 h-4" /> Salvo!
						{:else}
							Aplicar Metadados
						{/if}
					</button>
				</footer>
			{/if}
		</div>
	</div>
{/if}
