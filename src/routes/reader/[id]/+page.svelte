<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { PDFService } from '$lib/services/pdf';
	import { PersistenceService } from '$lib/services/persistence';
	import {
		ArrowLeft, Menu, Settings, ChevronLeft, ChevronRight,
		Maximize2, Minimize2, X, Loader2, BookOpen, AlertCircle, FileUp
	} from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { cn } from '$lib/utils';

	const id = $derived(page.params.id);
	const manga = $derived(mangaStore.library.find((m) => m.id === id));

	let currentPage = $state(1);
	let pdfDoc = $state<any>(null);
	let isControlsVisible = $state(true);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let readingMode = $state<'horizontal' | 'rtl' | 'vertical'>('horizontal');
	let sidebarOpen = $state(false);
	let pageImage = $state<string | null>(null);
	let isFullscreen = $state(false);

	let controlsTimeout: ReturnType<typeof setTimeout>;
	let touchStartX = 0;
	let touchStartY = 0;

	const READING_MODES: { value: 'horizontal' | 'rtl' | 'vertical'; label: string }[] = [
		{ value: 'horizontal', label: 'LTR' },
		{ value: 'rtl', label: 'RTL' },
		{ value: 'vertical', label: 'Vertical' },
	];

	onMount(async () => {
		if (manga) {
			const pageParam = page.url.searchParams.get('page');
			currentPage = pageParam ? Math.max(1, parseInt(pageParam)) : (manga.lastReadPage || 1);
			await loadMangaFile();
		}
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
	});

	onDestroy(() => {
		document.removeEventListener('keydown', handleKeyDown);
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		clearTimeout(controlsTimeout);
	});

	function handleKeyDown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		switch (e.key) {
			case 'ArrowRight':
			case 'l':
				readingMode === 'rtl' ? prevPage() : nextPage();
				break;
			case 'ArrowLeft':
			case 'h':
				readingMode === 'rtl' ? nextPage() : prevPage();
				break;
			case 'ArrowDown':
			case 'j':
				nextPage();
				break;
			case 'ArrowUp':
			case 'k':
				prevPage();
				break;
			case 'Escape':
				sidebarOpen = false;
				break;
			case 'f':
				toggleFullscreen();
				break;
			case 'm':
				cycleModes();
				break;
		}
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	function cycleModes() {
		const idx = READING_MODES.findIndex(m => m.value === readingMode);
		readingMode = READING_MODES[(idx + 1) % READING_MODES.length].value;
	}

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) {
			// Tap ou swipe vertical — toggle controles
			if (Math.abs(dx) < 10 && Math.abs(dy) < 10) isControlsVisible = !isControlsVisible;
			return;
		}
		if (readingMode === 'vertical') return;
		if (dx < 0) {
			readingMode === 'rtl' ? prevPage() : nextPage();
		} else {
			readingMode === 'rtl' ? nextPage() : prevPage();
		}
	}

	async function loadMangaFile() {
		if (!manga) return;

		let file: File | null = null;

		const handle = await PersistenceService.getHandle(manga.id);
		if (handle) {
			try {
				const permission = await (handle as any).requestPermission({ mode: 'read' });
				if (permission === 'granted') {
					file = await handle.getFile();
				} else {
					error =
						'O acesso ao arquivo foi negado. Verifique se o arquivo ainda existe e conceda a permissão quando solicitado.';
					isLoading = false;
					return;
				}
			} catch (err: any) {
				if (err?.name === 'NotFoundError') {
					error =
						'Arquivo não encontrado. Ele pode ter sido movido ou excluído. Selecione-o novamente abaixo.';
				} else {
					error = 'Não foi possível acessar o arquivo. Selecione-o novamente abaixo.';
				}
				isLoading = false;
				return;
			}
		} else {
			error =
				'Nenhuma permissão salva para este arquivo. Selecione o PDF manualmente para continuar.';
			isLoading = false;
			return;
		}

		try {
			pdfDoc = await PDFService.loadDocument(file);
		} catch {
			error =
				'Não foi possível abrir o PDF. O arquivo pode estar corrompido ou em um formato não suportado.';
			isLoading = false;
			return;
		}
		await renderPage();
		isLoading = false;
	}

	async function handleReupload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0] && manga) {
			const file = target.files[0];
			error = null;
			isLoading = true;
			pdfDoc = await PDFService.loadDocument(file);
			await renderPage();
			isLoading = false;
		}
	}

	async function renderPage() {
		if (!pdfDoc) return;
		pageImage = await PDFService.getPageAsImage(pdfDoc, currentPage, 1.5);
	}

	function handleMouseMove() {
		isControlsVisible = true;
		clearTimeout(controlsTimeout);
		controlsTimeout = setTimeout(() => {
			if (readingMode !== 'vertical' && !sidebarOpen) isControlsVisible = false;
		}, 4000);
	}

	async function nextPage() {
		if (currentPage < (manga?.totalPage || 0)) {
			currentPage++;
			await renderPage();
			updateProgress();
		}
	}

	async function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			await renderPage();
			updateProgress();
		}
	}

	function updateProgress() {
		if (manga) {
			mangaStore.updateProgress(manga.id, currentPage, manga.totalPage || 100);
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	}

	async function goToPage(num: number) {
		currentPage = num;
		sidebarOpen = false;
		isLoading = true;
		await renderPage();
		updateProgress();
		isLoading = false;
	}

	async function handleProgressBarClick(e: MouseEvent) {
		if (!manga?.totalPage) return;
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		const ratio = (e.clientX - rect.left) / rect.width;
		const targetPage = Math.max(1, Math.min(manga.totalPage, Math.round(ratio * manga.totalPage)));
		await goToPage(targetPage);
	}
</script>

<div
	class="fixed inset-0 bg-[#050505] text-white flex flex-col overflow-hidden select-none font-body"
	onmousemove={handleMouseMove}
>
	<!-- Barra superior -->
	<header
		class={cn(
			"absolute top-0 left-0 w-full z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between transition-all duration-500",
			!isControlsVisible && "-translate-y-full opacity-0"
		)}
	>
		<div class="flex items-center gap-4">
			<a href="{base}/manga/{id}" class="p-2 hover:bg-white/10 rounded-full transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<div>
				<h2 class="font-bold text-sm line-clamp-1 font-display">{manga?.title}</h2>
				<p class="text-[10px] text-white/50 uppercase tracking-widest leading-none mt-1 font-mono">Página {currentPage} de {manga?.totalPage}</p>
			</div>
		</div>

		<div class="flex items-center gap-1">
			<!-- Toggle modo de leitura (oculto em mobile, acessível via tecla M) -->
			<div class="hidden sm:flex items-center gap-0.5 bg-white/5 rounded-lg p-1 mr-2">
				{#each READING_MODES as mode}
					<button
						onclick={() => (readingMode = mode.value)}
						title={mode.label}
						class={cn(
							'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-all',
							readingMode === mode.value
								? 'bg-[var(--accent)] text-white'
								: 'text-white/40 hover:text-white/80'
						)}
					>
						{mode.label}
					</button>
				{/each}
			</div>
			<!-- Modo ativo compacto visível apenas em mobile -->
			<button
				onclick={cycleModes}
				class="sm:hidden px-2 py-1 rounded bg-white/5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] mr-1"
				title="Trocar modo (M)"
			>
				{readingMode === 'horizontal' ? 'LTR' : readingMode === 'rtl' ? 'RTL' : 'Vert'}
			</button>

			<button class="p-2 hover:bg-white/10 rounded-full transition-colors" onclick={() => (sidebarOpen = !sidebarOpen)}>
				<Menu class="w-5 h-5" />
			</button>
			<a href="{base}/settings" class="hidden sm:flex p-2 hover:bg-white/10 rounded-full transition-colors">
				<Settings class="w-5 h-5" />
			</a>
			<button class="p-2 hover:bg-white/10 rounded-full transition-colors" onclick={toggleFullscreen}>
				{#if isFullscreen}
					<Minimize2 class="w-5 h-5" />
				{:else}
					<Maximize2 class="w-5 h-5" />
				{/if}
			</button>
		</div>
	</header>

	<!-- Área do Leitor -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class={cn(
			"flex-grow flex items-center justify-center overflow-auto p-4 transition-all duration-300",
			readingMode === 'vertical' ? 'flex-col gap-4 py-20' : ''
		)}
		onclick={() => (isControlsVisible = !isControlsVisible)}
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		{#if isLoading}
			<div class="flex flex-col items-center gap-6">
				<div class="relative">
					<Loader2 class="w-16 h-16 text-[var(--accent)] animate-spin opacity-20" />
					<Loader2 class="absolute inset-0 w-16 h-16 text-[var(--accent)] animate-spin [animation-delay:-0.5s]" />
				</div>
				<div class="flex flex-col items-center gap-1">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Renderizando PDF</p>
					<p class="text-[10px] text-white/30 uppercase tracking-widest">Aguarde um momento</p>
				</div>
			</div>
		{:else if error}
			<div class="max-w-md p-10 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl flex flex-col items-center text-center gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
				<div class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
					<AlertCircle class="w-8 h-8" />
				</div>
				<div>
					<h3 class="font-bold text-lg mb-2">Arquivo não disponível</h3>
					<p class="text-sm text-[var(--text-secondary)]">{error}</p>
				</div>
				<label class="btn-primary w-full flex items-center justify-center gap-3 cursor-pointer py-4">
					<FileUp class="w-5 h-5" />
					SELECIONAR ARQUIVO NOVAMENTE
					<input type="file" accept="application/pdf" class="hidden" onchange={handleReupload} />
				</label>
			</div>
		{:else}
			<div class="relative shadow-[0_0_100px_rgba(0,0,0,0.5)] max-w-full">
				{#if pageImage}
					<img
						src={pageImage}
						alt="Página {currentPage}"
						class={cn(
							"max-h-[95vh] w-auto animate-in fade-in duration-300",
							readingMode === 'rtl' && "[transform:scaleX(-1)]"
						)}
					/>
				{:else}
					<div class="bg-white w-full max-w-2xl aspect-[3/4] flex items-center justify-center text-black/20 text-9xl font-display italic">
						{currentPage}
					</div>
				{/if}

				<!-- Overlays de Navegação -->
				{#if readingMode !== 'vertical'}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute inset-y-0 left-0 w-1/3 cursor-pointer flex items-center justify-start pl-8 group"
						onclick={(e) => { e.stopPropagation(); readingMode === 'rtl' ? nextPage() : prevPage(); }}
					>
						<div class="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all border border-white/10 -translate-x-4 group-hover:translate-x-0">
							<ChevronLeft class="w-6 h-6" />
						</div>
					</div>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute inset-y-0 right-0 w-1/3 cursor-pointer flex items-center justify-end pr-8 group"
						onclick={(e) => { e.stopPropagation(); readingMode === 'rtl' ? prevPage() : nextPage(); }}
					>
						<div class="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all border border-white/10 translate-x-4 group-hover:translate-x-0">
							<ChevronRight class="w-6 h-6" />
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Barra Inferior de Progresso -->
	<footer
		class={cn(
			"absolute bottom-0 left-0 w-full z-50 bg-black/80 backdrop-blur-xl border-t border-white/10 px-8 py-5 transition-all duration-500",
			!isControlsVisible && "translate-y-full opacity-0"
		)}
	>
		<div class="max-w-4xl mx-auto flex items-center gap-6">
			<span class="text-[10px] font-mono text-white/30 uppercase tracking-widest w-6 text-right">{currentPage}</span>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex-grow h-3 bg-white/5 rounded-full relative cursor-pointer group"
				onclick={handleProgressBarClick}
				title="Clique para navegar"
			>
				<div
					class="h-full bg-[var(--accent)] rounded-full relative transition-all duration-300 pointer-events-none"
					style="width: {(currentPage / (manga?.totalPage || 1)) * 100}%"
				>
					<div class="absolute right-0 top-0 h-full w-2 bg-white/20 blur-sm"></div>
				</div>
				<div class="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none"></div>
			</div>
			<span class="text-[10px] font-mono text-white/30 uppercase tracking-widest w-6">{manga?.totalPage}</span>
		</div>
		<p class="hidden sm:block text-center text-[9px] text-white/15 mt-2 uppercase tracking-widest font-mono">← → navegar &nbsp;·&nbsp; M modo &nbsp;·&nbsp; F tela cheia &nbsp;·&nbsp; ESC fechar</p>
		<p class="sm:hidden text-center text-[9px] text-white/15 mt-2 uppercase tracking-widest font-mono">deslize para navegar &nbsp;·&nbsp; toque para controles</p>
	</footer>

	<!-- Sidebar Lateral -->
	<aside
		class={cn(
			"fixed top-0 right-0 h-full w-80 bg-black/95 backdrop-blur-2xl border-l border-white/10 z-[100] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[-20px_0_50px_rgba(0,0,0,0.5)]",
			!sidebarOpen && "translate-x-full"
		)}
	>
		<div class="p-8 flex items-center justify-between border-b border-white/10">
			<h3 class="font-bold uppercase tracking-[0.2em] text-[10px] text-[var(--accent)]">Navegação</h3>
			<button onclick={() => (sidebarOpen = false)} class="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
				<X class="w-5 h-5" />
			</button>
		</div>

		<div class="p-6 overflow-y-auto h-[calc(100%-80px)] custom-scrollbar">
			<div class="aspect-[3/4] card mb-8 relative group rounded-xl overflow-hidden border border-white/10">
				<img src={manga?.coverUrl} alt={manga?.title} class="w-full h-full object-cover opacity-40 grayscale group-hover:grayscale-0 transition-all duration-500" />
				<div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
				<div class="absolute bottom-0 left-0 w-full p-6">
					<h4 class="font-display font-bold text-lg leading-tight mb-1">{manga?.title}</h4>
					<p class="text-[10px] text-white/40 uppercase tracking-widest font-mono">{manga?.author}</p>
				</div>
			</div>

			<div class="flex items-center justify-between mb-4 px-1">
				<span class="text-[10px] font-bold uppercase tracking-widest text-white/30">Capítulos</span>
				<span class="text-[10px] font-mono text-white/30">{manga?.bookmarks?.length || 0} encontrados</span>
			</div>

			<div class="flex flex-col gap-2">
				{#each manga?.bookmarks || [] as chapter, i}
					<button
						onclick={() => goToPage(chapter.pageNumber)}
						class="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group active:scale-[0.98]"
					>
						<div class="flex items-center gap-4">
							<span class="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[10px] font-bold text-[var(--accent)]">
								{String(i + 1).padStart(2, '0')}
							</span>
							<div>
								<span class="text-sm font-bold block leading-none">{chapter.title}</span>
								<span class="text-[9px] text-white/30 uppercase tracking-widest mt-1 block">Página {chapter.pageNumber}</span>
							</div>
						</div>
						<BookOpen class={cn(
							"w-4 h-4 transition-colors",
							currentPage >= chapter.pageNumber ? "text-[var(--accent)]" : "text-white/20"
						)} />
					</button>
				{:else}
					<p class="text-[10px] text-center text-white/20 py-10 uppercase tracking-widest">Nenhum capítulo detectado</p>
				{/each}
			</div>
		</div>
	</aside>
</div>

<style>
	:global(body) {
		overflow: hidden;
		background: #000;
	}

  .custom-scrollbar::-webkit-scrollbar {
    width: 2px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
  }
</style>
