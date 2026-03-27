<script lang="ts">
	import { Plus, X, Search, BookOpen, Loader2, Check } from 'lucide-svelte';
	import { PDFService, type PDFBookmark } from '$lib/services/pdf';
	import { MetadataService, type MangaMetadata } from '$lib/services/metadata';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { cn } from '$lib/utils';

	let { isOpen, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

	let step = $state<'upload' | 'identify' | 'confirm'>('upload');
	let isProcessing = $state(false);
	let selectedFile = $state<File | null>(null);
	let suggestedTitle = $state('');
	let searchResults = $state<MangaMetadata[]>([]);
	let selectedMetadata = $state<MangaMetadata | null>(null);
	let previewUrl = $state('');
	let pageCount = $state(0);
	let bookmarks = $state<PDFBookmark[]>([]);

	async function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			selectedFile = target.files[0];
			isProcessing = true;
			
			try {
				const doc = await PDFService.loadDocument(selectedFile);
				const meta = await PDFService.getMetadata(doc);
				pageCount = meta.pageCount;
				bookmarks = meta.bookmarks;
				
				suggestedTitle = meta.title || await MetadataService.extractTitleFromFilename(selectedFile.name);
				previewUrl = await PDFService.getPageAsImage(doc, 1, 0.4);
				searchResults = await MetadataService.searchAniList(suggestedTitle);
				
				if (searchResults.length > 0) {
					selectedMetadata = searchResults[0];
				}
				
				step = 'identify';
			} catch (err) {
				console.error('Erro na importação', err);
				alert('Erro ao ler PDF: ' + (err as Error).message);
			} finally {
				isProcessing = false;
			}
		}
	}

	function handleConfirm() {
		if (!selectedFile || !selectedMetadata) return;
		
		mangaStore.addManga({
			id: selectedMetadata.id || crypto.randomUUID(),
			title: selectedMetadata.title,
			author: selectedMetadata.author,
			coverUrl: selectedMetadata.coverUrl,
			description: selectedMetadata.description,
			progress: 0,
			lastReadPage: 1,
			totalPage: pageCount,
			filePath: selectedFile.name,
			addedAt: new Date().toISOString(),
			bookmarks: bookmarks
		});
		
		reset();
		onClose();
	}

	function reset() {
		step = 'upload';
		selectedFile = null;
		selectedMetadata = null;
		searchResults = [];
		previewUrl = '';
		bookmarks = [];
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={onClose}></div>
		
		<div class="relative bg-[var(--bg-primary)] border border-[var(--border)] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
			
			<header class="flex items-center justify-between p-6 border-b border-[var(--border)]">
				<h2 class="text-xl font-display font-bold">Importar Mangá</h2>
				<button onclick={onClose} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
					<X class="w-6 h-6" />
				</button>
			</header>

			<div class="p-8">
				{#if step === 'upload'}
					<div 
            class="flex flex-col items-center justify-center py-10 px-6 border-2 border-dashed border-[var(--border)] rounded-2xl group hover:border-[var(--accent)] transition-colors"
          >
						<div class="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mb-6">
							{#if isProcessing}
								<Loader2 class="w-8 h-8 text-[var(--accent)] animate-spin" />
							{:else}
								<Plus class="w-8 h-8 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
							{/if}
						</div>
						<h3 class="text-lg mb-2 font-bold font-body">Selecione seu arquivo PDF</h3>
						<p class="text-[var(--text-secondary)] text-sm mb-6 font-body">Arraste e solte ou clique para navegar</p>
						
						<label class="btn-primary cursor-pointer flex items-center gap-2">
							<BookOpen class="w-5 h-5" />
							Escolher Arquivo
							<input type="file" accept="application/pdf" class="hidden" onchange={handleFileSelect} disabled={isProcessing} />
						</label>
					</div>
				{:else if step === 'identify'}
					<div class="flex flex-col gap-8">
						<div class="flex flex-col md:flex-row gap-8">
							<div class="w-full md:w-32 flex-shrink-0">
								<div class="aspect-[3/4] card mb-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden">
									{#if previewUrl}
										<img src={previewUrl} alt="Preview" class="w-full h-full object-cover" />
									{/if}
								</div>
								<p class="text-[10px] text-[var(--text-muted)] uppercase tracking-widest text-center truncate font-mono">
									{bookmarks.length > 0 ? `${bookmarks.length} Capítulos` : 'Volume Único'}
								</p>
							</div>

							<div class="flex-grow">
								<h3 class="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-4 font-bold">Identificamos o seguinte:</h3>
								
								<div class="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
									{#each searchResults as meta}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div 
											class={cn(
												"p-4 border rounded-[var(--radius)] cursor-pointer transition-all flex gap-4 items-start",
												selectedMetadata?.id === meta.id 
													? "border-[var(--accent)] bg-[var(--bg-secondary)]" 
													: "border-[var(--border)] hover:bg-[var(--bg-secondary)] opacity-60 hover:opacity-100"
											)}
											onclick={() => selectedMetadata = meta}
										>
											<img src={meta.coverUrl} alt={meta.title} class="w-12 h-16 object-cover rounded shadow-md flex-shrink-0" />
											<div class="flex-grow">
												<h4 class="font-bold text-sm leading-tight text-[var(--text-primary)]">{meta.title}</h4>
												<p class="text-xs text-[var(--text-secondary)] mt-1 font-body">{meta.author}</p>
											</div>
											{#if selectedMetadata?.id === meta.id}
												<div class="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
													<Check class="w-4 h-4 text-[var(--accent)]" />
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						</div>

						<footer class="flex items-center justify-end gap-3 pt-6 border-t border-[var(--border)]">
							<button onclick={reset} class="px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm font-bold">VOLTAR</button>
							<button onclick={handleConfirm} class="btn-primary px-6 py-2 uppercase font-bold text-xs" disabled={!selectedMetadata}>Confirmar e Adicionar</button>
						</footer>
					</div>
				{/if}
			</div>
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
