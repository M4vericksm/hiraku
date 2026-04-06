<script lang="ts">
	import { X, Search, BookOpen, Loader2, Check, AlertCircle, Trash2, Plus, RefreshCw, Edit2 } from 'lucide-svelte';
	import { PDFService, type PDFBookmark } from '$lib/services/pdf';
	import { MetadataService, type MangaMetadata } from '$lib/services/metadata';
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import { cn } from '$lib/utils';

	let { isOpen, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

	interface ImportItem {
		id: string;
		file: File;
		handle?: FileSystemFileHandle;
		// pipeline status
		status: 'pending' | 'processing' | 'identifying' | 'ready' | 'error' | 'no-match';
		suggestedTitle: string;   // clean title from filename (for display)
		searchQuery: string;      // the query sent to AniList (editable)
		isEditingSearch: boolean; // inline search input visible
		isSearching: boolean;     // re-searching in progress
		metadata: MangaMetadata | null;
		anilistResults: MangaMetadata[];
		pageCount: number;
		bookmarks: PDFBookmark[];
		previewUrl: string;    // tiny thumbnail for the import list UI (scale 0.2)
		coverUrl: string;      // full-quality cover to store (scale 1.5, or AniList URL)
		error?: string;
	}

	let items = $state<ImportItem[]>([]);
	let isComplete = $derived(
		items.length > 0 && items.every(i => i.status === 'ready' || i.status === 'error' || i.status === 'no-match')
	);
	let readyCount = $derived(items.filter(i => i.status === 'ready' || i.status === 'no-match').length);

	let fileInputEl: HTMLInputElement;

	// ── File picking ──────────────────────────────────────────────────────────

	async function handleFilePicker() {
		if (!('showOpenFilePicker' in window)) { fileInputEl?.click(); return; }
		try {
			const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
				multiple: true,
				types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
			});
			const newItems: ImportItem[] = await Promise.all(handles.map(async (handle) => {
				const file = await handle.getFile();
				return makeItem(file, handle);
			}));
			items = [...items, ...newItems];
			processQueue();
		} catch (e: any) {
			if (e?.name !== 'AbortError') fileInputEl?.click();
		}
	}

	async function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (!target.files) return;
		const newItems = Array.from(target.files).map(f => makeItem(f));
		items = [...items, ...newItems];
		processQueue();
	}

	async function handleDirectoryPicker() {
		if (!('showDirectoryPicker' in window)) { alert('Seu navegador não suporta seleção de pastas.'); return; }
		try {
			const dirHandle = await (window as any).showDirectoryPicker();
			const newItems: ImportItem[] = [];
			for await (const entry of dirHandle.values()) {
				if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
					const file = await entry.getFile();
					newItems.push(makeItem(file, entry));
				}
			}
			items = [...items, ...newItems];
			processQueue();
		} catch (err: any) {
			if (err?.name !== 'AbortError') console.error('Erro ao acessar pasta', err);
		}
	}

	function makeItem(file: File, handle?: FileSystemFileHandle): ImportItem {
		const searchQuery = MetadataService.extractTitleFromFilename(file.name);
		return {
			id: crypto.randomUUID(),
			file,
			handle,
			status: 'pending',
			suggestedTitle: searchQuery || file.name.replace(/\.[^/.]+$/, ''),
			searchQuery,
			isEditingSearch: false,
			isSearching: false,
			metadata: null,
			anilistResults: [],
			pageCount: 0,
			bookmarks: [],
			previewUrl: '',
			coverUrl: '',
		};
	}

	// ── Processing pipeline ───────────────────────────────────────────────────

	async function processQueue() {
		for (const item of items.filter(i => i.status === 'pending')) {
			await processItem(item);
		}
	}

	async function processItem(item: ImportItem) {
		const idx = () => items.findIndex(i => i.id === item.id);
		if (idx() === -1) return;
		try {
			items[idx()].status = 'processing';

			const doc = await PDFService.loadDocument(item.file);
			const meta = await PDFService.getMetadata(doc);
			items[idx()].pageCount = meta.pageCount;
			items[idx()].bookmarks = meta.bookmarks;
			// Small thumbnail just for the import list UI
			items[idx()].previewUrl = await PDFService.getPageAsImage(doc, 1, 0.2);
			// High-quality cover used when AniList has no match (scale 1.5 ≈ 900px tall)
			items[idx()].coverUrl = await PDFService.getPageAsImage(doc, 1, 1.5);

			items[idx()].status = 'identifying';
			await runAniListSearch(item.id);
		} catch (err: any) {
			const i = idx();
			if (i !== -1) {
				items[i].status = 'error';
				items[i].error = (err as Error).message;
			}
		}
	}

	/**
	 * Run (or re-run) AniList search for a single item, using its current searchQuery.
	 */
	async function runAniListSearch(itemId: string) {
		const i = items.findIndex(x => x.id === itemId);
		if (i === -1) return;

		items[i].isSearching = true;
		items[i].isEditingSearch = false;

		const q = items[i].searchQuery.trim();
		const results = q ? await MetadataService.searchAniList(q) : [];

		// re-find index after await (array may have been reassigned)
		const j = items.findIndex(x => x.id === itemId);
		if (j === -1) return;

		items[j].isSearching = false;
		items[j].anilistResults = results;

		if (results.length === 1) {
			// Single unambiguous match — auto-select but still show it
			items[j].metadata = results[0];
			items[j].status = 'ready';
		} else if (results.length > 1) {
			// Multiple results — user must pick
			items[j].metadata = results[0]; // pre-select first as default
			items[j].status = 'identifying';
		} else {
			// No results — fall back to local data using high-quality PDF cover
			items[j].metadata = {
				id: crypto.randomUUID(),
				title: items[j].suggestedTitle || items[j].file.name.replace(/\.[^/.]+$/, ''),
				coverUrl: items[j].coverUrl || items[j].previewUrl,
				description: '',
				author: undefined,
			};
			items[j].status = 'no-match';
		}
	}

	// ── Actions ────────────────────────────────────────────────────────────────

	function removeItem(id: string) { items = items.filter(i => i.id !== id); }

	function selectResult(itemId: string, result: MangaMetadata) {
		const i = items.findIndex(x => x.id === itemId);
		if (i !== -1) { items[i].metadata = result; items[i].status = 'ready'; }
	}

	function startEditSearch(itemId: string) {
		const i = items.findIndex(x => x.id === itemId);
		if (i !== -1) items[i].isEditingSearch = true;
	}

	async function handleConfirmAll() {
		const ready = items.filter(i => (i.status === 'ready' || i.status === 'no-match') && i.metadata);
		await mangaStore.addMangas(ready.map(item => ({
			manga: {
				id: crypto.randomUUID(),
				anilistId: item.metadata!.id,
				title: item.metadata!.title,
				author: item.metadata!.author,
				// Use AniList cover if available; otherwise use high-quality PDF render
				coverUrl: item.metadata!.coverUrl || item.coverUrl,
				description: item.metadata!.description,
				genres: (item.metadata as any).genres,
				status: (item.metadata as any).status,
				averageScore: (item.metadata as any).averageScore,
				progress: 0,
				lastReadPage: 1,
				totalPage: item.pageCount,
				filePath: item.file.name,
				addedAt: new Date().toISOString(),
				bookmarks: item.bookmarks,
			} as Manga,
			handle: item.handle,
		})));
		items = [];
		onClose();
	}
</script>

{#if isOpen}
<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
	<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={onClose}></div>

	<div class="relative bg-[var(--bg-primary)] border border-[var(--border)] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">

		<header class="flex items-center justify-between p-6 border-b border-[var(--border)]">
			<div>
				<h2 class="text-xl font-display font-bold">Importar Mangás</h2>
				<p class="text-xs text-[var(--text-muted)] uppercase tracking-widest mt-1">Selecione arquivos ou uma pasta inteira</p>
			</div>
			<button onclick={onClose} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
				<X class="w-6 h-6" />
			</button>
		</header>

		<div class="flex-grow overflow-y-auto p-6 custom-scrollbar">
			{#if items.length === 0}
				<!-- Drop zone -->
				<div class="flex flex-col md:flex-row gap-4 mt-8">
					<button onclick={handleFilePicker}
						class="flex-1 flex flex-col items-center justify-center py-14 px-6 border-2 border-dashed border-[var(--border)] rounded-2xl group hover:border-[var(--accent)] cursor-pointer transition-all bg-[var(--bg-secondary)]/30 hover:bg-[var(--bg-secondary)]/50"
					>
						<div class="w-14 h-14 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-[var(--accent)] transition-all">
							<BookOpen class="w-7 h-7 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
						</div>
						<h3 class="text-base font-bold mb-1">Arquivos PDF</h3>
						<p class="text-xs text-[var(--text-muted)] uppercase tracking-widest">Múltiplos arquivos</p>
						<input type="file" accept="application/pdf" multiple class="hidden" bind:this={fileInputEl} onchange={handleFileSelect} />
					</button>

					<button onclick={handleDirectoryPicker}
						class="flex-1 flex flex-col items-center justify-center py-14 px-6 border-2 border-dashed border-[var(--border)] rounded-2xl group hover:border-[var(--accent)] transition-all bg-[var(--bg-secondary)]/30 hover:bg-[var(--bg-secondary)]/50"
					>
						<div class="w-14 h-14 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-[var(--accent)] transition-all">
							<Plus class="w-7 h-7 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
						</div>
						<h3 class="text-base font-bold mb-1">Pasta Completa</h3>
						<p class="text-xs text-[var(--text-muted)] uppercase tracking-widest">Importar diretório</p>
					</button>
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					{#each items as item (item.id)}
						{@const isLoading = item.status === 'processing' || item.isSearching}
						<div class={cn(
							'border rounded-xl p-3 flex gap-3 relative group transition-all',
							item.status === 'ready'    && 'border-green-500/30 bg-green-500/3',
							item.status === 'no-match' && 'border-[var(--border)] bg-[var(--bg-secondary)]/30',
							item.status === 'error'    && 'border-red-500/40 bg-red-500/5',
							item.status === 'identifying' && 'border-[var(--accent)]/40 bg-[var(--accent)]/3',
							(item.status === 'pending' || item.status === 'processing') && 'border-dashed border-[var(--border)]',
						)}>
							<!-- Cover / preview -->
							<div class="w-14 flex-shrink-0 aspect-[3/4] rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-secondary)] relative">
								{#if item.metadata?.coverUrl && item.metadata.coverUrl !== item.previewUrl}
									<img src={item.metadata.coverUrl} alt="Cover" class="w-full h-full object-cover" />
								{:else if item.previewUrl}
									<img src={item.previewUrl} alt="Preview" class="w-full h-full object-cover opacity-60" />
								{/if}
								{#if isLoading}
									<div class="absolute inset-0 bg-black/70 flex items-center justify-center">
										<Loader2 class="w-5 h-5 text-[var(--accent)] animate-spin" />
									</div>
								{/if}
							</div>

							<!-- Info block -->
							<div class="flex-grow min-w-0 flex flex-col gap-1.5 pr-7">
								<!-- Title (from metadata or filename) -->
								<p class="text-sm font-bold truncate leading-tight">
									{item.metadata?.title || item.suggestedTitle}
								</p>
								<p class="text-[9px] text-[var(--text-muted)] truncate uppercase tracking-wide">{item.file.name}</p>

								<!-- Status section -->
								{#if item.status === 'processing' || (item.status === 'identifying' && item.isSearching)}
									<div class="flex items-center gap-1.5 mt-1">
										<Loader2 class="w-3 h-3 text-[var(--accent)] animate-spin" />
										<span class="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">Buscando na AniList...</span>
									</div>

								{:else if item.status === 'ready'}
									<div class="flex items-center justify-between mt-1">
										<div class="flex items-center gap-1.5">
											<Check class="w-3 h-3 text-green-500 flex-shrink-0" />
											<span class="text-[9px] font-bold text-green-500 uppercase tracking-widest">Encontrado</span>
											{#if item.metadata?.startYear}
												<span class="text-[9px] text-[var(--text-muted)]">· {item.metadata.startYear}</span>
											{/if}
											{#if item.metadata?.averageScore}
												<span class="text-[9px] text-[var(--text-muted)]">· ★ {item.metadata.averageScore}</span>
											{/if}
										</div>
										<button
											onclick={() => startEditSearch(item.id)}
											class="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1 transition-colors"
											title="Buscar outro título"
										>
											<Edit2 class="w-2.5 h-2.5" /> Mudar
										</button>
									</div>
									{#if item.metadata?.author}
										<p class="text-[9px] text-[var(--text-muted)] truncate">{item.metadata.author}</p>
									{/if}

								{:else if item.status === 'identifying'}
									<!-- Multiple results — user must pick one -->
									<div class="mt-1">
										<div class="flex items-center justify-between mb-2">
											<span class="text-[9px] text-[var(--accent)] font-bold uppercase tracking-widest">Qual é o correto?</span>
											<button onclick={() => startEditSearch(item.id)} class="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1 transition-colors">
												<Search class="w-2.5 h-2.5" /> Outra busca
											</button>
										</div>
										<div class="flex gap-2 flex-wrap">
											{#each item.anilistResults.slice(0, 6) as result}
												<button
													onclick={() => selectResult(item.id, result)}
													class="flex flex-col items-center gap-1 group/r"
													title={result.title}
												>
													{#if result.coverUrl}
														<img src={result.coverUrl} alt={result.title}
															class="w-9 h-12 object-cover rounded border-2 transition-colors {item.metadata?.id === result.id ? 'border-[var(--accent)]' : 'border-[var(--border)] group-hover/r:border-[var(--accent)]/60'}" />
													{/if}
													<span class="text-[7px] text-[var(--text-muted)] line-clamp-1 w-9 text-center leading-tight">{result.title.replace(/:.+/, '')}</span>
												</button>
											{/each}
										</div>
										<p class="text-[8px] text-[var(--text-muted)] mt-1.5">Clique em um resultado para selecionar e continuar.</p>
									</div>

								{:else if item.status === 'no-match'}
									<div class="flex items-center justify-between mt-1">
										<div class="flex items-center gap-1.5">
											<AlertCircle class="w-3 h-3 text-yellow-500/70 flex-shrink-0" />
											<span class="text-[9px] text-yellow-500/70 uppercase tracking-widest font-bold">Não encontrado na AniList</span>
										</div>
										<button
											onclick={() => startEditSearch(item.id)}
											class="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1 transition-colors"
										>
											<Search class="w-2.5 h-2.5" /> Buscar
										</button>
									</div>
									<p class="text-[9px] text-[var(--text-muted)]">Será importado localmente sem metadados.</p>

								{:else if item.status === 'error'}
									<div class="flex items-center gap-1.5 mt-1">
										<AlertCircle class="w-3 h-3 text-red-500 flex-shrink-0" />
										<span class="text-[9px] text-red-400 uppercase tracking-widest font-bold">Erro ao processar</span>
									</div>
									{#if item.error}
										<p class="text-[8px] text-red-400 italic truncate">{item.error}</p>
									{/if}
								{/if}

								<!-- Inline search override (appears when user clicks Mudar/Buscar) -->
								{#if item.isEditingSearch}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div class="mt-2 flex gap-1.5" onkeydown={(e) => e.key === 'Enter' && runAniListSearch(item.id)}>
										<input
											type="text"
											bind:value={items[items.findIndex(x => x.id === item.id)].searchQuery}
											placeholder="Ex: Berserk, One Piece..."
											class="flex-grow bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)] transition-colors"
										/>
										<button
											onclick={() => runAniListSearch(item.id)}
											class="px-2.5 py-1.5 bg-[var(--accent)] text-[var(--accent-foreground)] rounded-lg text-xs font-bold flex items-center gap-1 hover:opacity-90 transition-opacity"
										>
											<RefreshCw class="w-3 h-3" /> Buscar
										</button>
									</div>
								{/if}
							</div>

							<!-- Remove button -->
							<button
								onclick={() => removeItem(item.id)}
								class="absolute top-2.5 right-2.5 p-1 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
							>
								<Trash2 class="w-3.5 h-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if items.length > 0}
			<footer class="p-5 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 flex items-center justify-between">
				<p class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
					{readyCount} de {items.length} prontos
					{#if !isComplete}<span class="text-[var(--text-muted)] font-normal"> · aguardando seleção</span>{/if}
				</p>
				<div class="flex gap-3">
					<button onclick={() => (items = [])} class="px-4 py-2 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
						Cancelar
					</button>
					<button
						onclick={handleConfirmAll}
						disabled={readyCount === 0 || !isComplete}
						class="btn-primary px-6 py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-40"
					>
						{isComplete ? `Importar ${readyCount}` : 'Processando...'}
					</button>
				</div>
			</footer>
		{/if}
	</div>
</div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: var(--bg-secondary); }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
</style>
