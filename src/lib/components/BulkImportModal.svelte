<script lang="ts">
	import { X, Search, BookOpen, Loader2, Check, AlertCircle, Trash2, Plus } from 'lucide-svelte';
	import { PDFService, type PDFBookmark } from '$lib/services/pdf';
	import { MetadataService, type MangaMetadata } from '$lib/services/metadata';
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import { cn } from '$lib/utils';

	let { isOpen, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

	interface ImportItem {
		id: string;
		file: File;
		handle?: FileSystemFileHandle;
		status: 'pending' | 'processing' | 'identifying' | 'ready' | 'error';
		progress: number;
		suggestedTitle: string;
		metadata: MangaMetadata | null;
		pageCount: number;
		bookmarks: PDFBookmark[];
		previewUrl: string;
		error?: string;
	}

	let items = $state<ImportItem[]>([]);
	let isComplete = $derived(items.length > 0 && items.every(i => i.status === 'ready' || i.status === 'error'));
	let readyCount = $derived(items.filter(i => i.status === 'ready').length);

	async function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files) {
			const newFiles = Array.from(target.files);
			const newItems: ImportItem[] = newFiles.map(file => ({
				id: crypto.randomUUID(),
				file,
				status: 'pending',
				progress: 0,
				suggestedTitle: file.name,
				metadata: null,
				pageCount: 0,
				bookmarks: [],
				previewUrl: ''
			}));
			items = [...items, ...newItems];
			processQueue();
		}
	}

	async function processQueue() {
		const pendingItems = items.filter(i => i.status === 'pending');
		for (const item of pendingItems) {
			await processItem(item);
		}
	}

	async function processItem(item: ImportItem) {
		const idx = items.findIndex(i => i.id === item.id);
		if (idx === -1) return;

		try {
			items[idx].status = 'processing';
			const doc = await PDFService.loadDocument(item.file);
			const meta = await PDFService.getMetadata(doc);
			
			items[idx].pageCount = meta.pageCount;
			items[idx].bookmarks = meta.bookmarks;
			items[idx].previewUrl = await PDFService.getPageAsImage(doc, 1, 0.2);
			
			items[idx].status = 'identifying';
			const rawTitle = meta.title || await MetadataService.extractTitleFromFilename(item.file.name);
			items[idx].suggestedTitle = rawTitle;
			
			const results = await MetadataService.searchAniList(rawTitle);
			if (results.length > 0) {
				items[idx].metadata = results[0];
				items[idx].status = 'ready';
			} else {
				// Fallback metadata if search fails
				items[idx].metadata = {
					id: crypto.randomUUID(),
					title: rawTitle,
					coverUrl: items[idx].previewUrl,
					description: 'Importado localmente.',
					author: 'Desconhecido'
				};
				items[idx].status = 'ready';
			}
		} catch (err) {
			console.error(`Erro ao processar ${item.file.name}`, err);
			items[idx].status = 'error';
			items[idx].error = (err as Error).message;
		}
	}

	function removeItem(id: string) {
		items = items.filter(i => i.id !== id);
	}

	async function handleConfirmAll() {
		const readyItems = items.filter(i => i.status === 'ready' && i.metadata);
		const mangasToAdd = readyItems.map(item => ({
			manga: {
				id: item.metadata!.id || crypto.randomUUID(),
				title: item.metadata!.title,
				author: item.metadata!.author,
				coverUrl: item.metadata!.coverUrl,
				description: item.metadata!.description,
				progress: 0,
				lastReadPage: 1,
				totalPage: item.pageCount,
				filePath: item.file.name,
				addedAt: new Date().toISOString(),
				bookmarks: item.bookmarks
			} as Manga,
			handle: item.handle
		}));

		await mangaStore.addMangas(mangasToAdd);
		reset();
		onClose();
	}

	function reset() {
		items = [];
	}

  async function handleDirectoryPicker() {
    if (!('showDirectoryPicker' in window)) {
      alert('Seu navegador não suporta seleção de pastas.');
      return;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      const newItems: ImportItem[] = [];
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
          const file = await entry.getFile();
          newItems.push({
            id: crypto.randomUUID(),
            file,
            handle: entry,
            status: 'pending',
            progress: 0,
            suggestedTitle: file.name,
            metadata: null,
            pageCount: 0,
            bookmarks: [],
            previewUrl: ''
          });
        }
      }
      
      items = [...items, ...newItems];
      processQueue();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Erro ao acessar pasta', err);
      }
    }
  }
</script>

{#if isOpen}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
		<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={onClose}></div>
		
		<div class="relative bg-[var(--bg-primary)] border border-[var(--border)] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
			
			<header class="flex items-center justify-between p-6 border-b border-[var(--border)]">
				<div>
					<h2 class="text-xl font-display font-bold">Importação em Lote</h2>
					<p class="text-xs text-[var(--text-muted)] uppercase tracking-widest mt-1">Selecione arquivos ou uma pasta inteira</p>
				</div>
				<button onclick={onClose} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
					<X class="w-6 h-6" />
				</button>
			</header>

			<div class="flex-grow overflow-y-auto p-8 custom-scrollbar">
				{#if items.length === 0}
					<div class="flex flex-col md:flex-row gap-6 mt-10">
						<label class="flex-1 flex flex-col items-center justify-center py-16 px-6 border-2 border-dashed border-[var(--border)] rounded-2xl group hover:border-[var(--accent)] cursor-pointer transition-all bg-[var(--bg-secondary)]/30 hover:bg-[var(--bg-secondary)]/50">
							<div class="w-16 h-16 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 group-hover:border-[var(--accent)] transition-all">
								<BookOpen class="w-8 h-8 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
							</div>
							<h3 class="text-lg font-bold mb-1">Arquivos PDF</h3>
							<p class="text-xs text-[var(--text-muted)] uppercase tracking-widest">Selecionar múltiplos arquivos</p>
							<input type="file" accept="application/pdf" multiple class="hidden" onchange={handleFileSelect} />
						</label>

						<button 
              onclick={handleDirectoryPicker}
              class="flex-1 flex flex-col items-center justify-center py-16 px-6 border-2 border-dashed border-[var(--border)] rounded-2xl group hover:border-[var(--accent)] transition-all bg-[var(--bg-secondary)]/30 hover:bg-[var(--bg-secondary)]/50"
            >
							<div class="w-16 h-16 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 group-hover:border-[var(--accent)] transition-all">
								<Plus class="w-8 h-8 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
							</div>
							<h3 class="text-lg font-bold mb-1">Pasta Completa</h3>
							<p class="text-xs text-[var(--text-muted)] uppercase tracking-widest">Importar diretório de mangás</p>
						</button>
					</div>
				{:else}
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{#each items as item (item.id)}
							<div class={cn(
								"p-4 border rounded-xl flex gap-4 relative group transition-all",
								item.status === 'ready' ? "border-[var(--border)] bg-[var(--bg-secondary)]/40" : "border-[var(--border)] border-dashed",
								item.status === 'error' && "border-red-500/50 bg-red-500/5"
							)}>
								<div class="w-16 aspect-[3/4] bg-[var(--bg-primary)] rounded border border-[var(--border)] overflow-hidden flex-shrink-0 relative">
									{#if item.previewUrl}
										<img src={item.previewUrl} alt="Preview" class="w-full h-full object-cover" />
									{/if}
									{#if item.status === 'processing' || item.status === 'identifying'}
										<div class="absolute inset-0 bg-black/60 flex items-center justify-center">
											<Loader2 class="w-6 h-6 text-[var(--accent)] animate-spin" />
										</div>
									{/if}
								</div>

								<div class="flex-grow min-w-0 pr-6">
									<h4 class="text-sm font-bold truncate mb-1">
										{item.metadata?.title || item.suggestedTitle}
									</h4>
									<p class="text-[10px] text-[var(--text-muted)] uppercase tracking-widest truncate">
										{item.file.name}
									</p>
									
									<div class="mt-3 flex items-center gap-2">
										{#if item.status === 'ready'}
											<Check class="w-3 h-3 text-green-500" />
											<span class="text-[9px] font-bold text-green-500 uppercase tracking-widest">Pronto</span>
										{:else if item.status === 'error'}
											<div class="flex flex-col gap-1">
												<div class="flex items-center gap-2">
													<AlertCircle class="w-3 h-3 text-red-500" />
													<span class="text-[9px] font-bold text-red-500 uppercase tracking-widest">Erro</span>
												</div>
												{#if item.error}
													<p class="text-[8px] text-red-400 line-clamp-1 italic">{item.error}</p>
												{/if}
											</div>
										{:else}
											<div class="w-full bg-[var(--bg-primary)] h-1 rounded-full overflow-hidden border border-[var(--border)]">
												<div class="bg-[var(--accent)] h-full animate-pulse" style="width: 50%"></div>
											</div>
										{/if}
									</div>
								</div>

								<button 
									onclick={() => removeItem(item.id)}
									class="absolute top-2 right-2 p-1.5 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
								>
									<Trash2 class="w-4 h-4" />
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if items.length > 0}
				<footer class="p-6 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 flex items-center justify-between">
					<div class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
						{readyCount} de {items.length} prontos para importar
					</div>
					<div class="flex items-center gap-3">
						<button onclick={reset} class="px-4 py-2 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors" disabled={!isComplete}>Limpar</button>
						<button 
							onclick={handleConfirmAll} 
							class="btn-primary flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-widest"
							disabled={readyCount === 0 || !isComplete}
						>
							{#if isComplete}
								Finalizar {readyCount} Mangás
							{:else}
								Processando...
							{/if}
						</button>
					</div>
				</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 10px;
  }
</style>
