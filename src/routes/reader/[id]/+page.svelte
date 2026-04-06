<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { PDFService } from '$lib/services/pdf';
	import { PersistenceService } from '$lib/services/persistence';
	import {
		ArrowLeft, Menu, Settings, ChevronLeft, ChevronRight,
		Maximize2, Minimize2, X, Loader2, BookOpen, AlertCircle,
		FileUp, ZoomIn, ZoomOut, KeyRound
	} from 'lucide-svelte';
	import { onMount, onDestroy, tick } from 'svelte';
	import { cn } from '$lib/utils';

	const id = $derived(page.params.id);
	const manga = $derived(mangaStore.library.find((m) => m.id === id));

	// Reader state
	let currentPage = $state(1);
	let pdfDoc = $state<any>(null);
	let isControlsVisible = $state(true);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let needsPermission = $state(false);
	let readingMode = $state<'horizontal' | 'rtl' | 'vertical'>('horizontal');
	let sidebarOpen = $state(false);
	let pageImage = $state<string | null>(null);
	let isFullscreen = $state(false);

	// Zoom
	let zoomLevel = $state(1.0);
	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 4.0;
	const ZOOM_STEP = 0.25;

	// Pinch zoom tracking (managed via addEventListener in onMount)
	let pinchStartDist = 0;
	let pinchStartZoom = 1.0;
	let activeTouches = 0;

	// Vertical scroll mode
	let verticalPages = $state<(string | null)[]>([]);
	let verticalContainer: HTMLElement | null = null;
	let renderCancelled = false;

	let controlsTimeout: ReturnType<typeof setTimeout>;
	let touchStartX = 0;
	let touchStartY = 0;

	const READING_MODES: { value: 'horizontal' | 'rtl' | 'vertical'; label: string }[] = [
		{ value: 'horizontal', label: 'LTR' },
		{ value: 'rtl', label: 'RTL' },
		{ value: 'vertical', label: 'Scroll' },
	];

	// Trigger vertical render when mode changes
	$effect(() => {
		if (readingMode === 'vertical' && pdfDoc && manga) {
			renderCancelled = false;
			startVerticalRender();
		} else if (readingMode !== 'vertical') {
			renderCancelled = true;
			verticalPages = [];
		}
	});

	async function startVerticalRender() {
		if (!manga || !pdfDoc) return;
		const total = manga.totalPage;
		verticalPages = new Array(total).fill(null);
		let scrolledToCurrentPage = false;

		for (let i = 0; i < total; i++) {
			if (renderCancelled) break;
			verticalPages[i] = await PDFService.getPageAsImage(pdfDoc, i + 1, 1.5);
			// Scroll to current page as soon as it's rendered
			if (!renderCancelled && !scrolledToCurrentPage && i + 1 >= currentPage) {
				await tick();
				scrollToPage(currentPage);
				scrolledToCurrentPage = true;
			}
		}
	}

	function scrollToPage(pageNum: number) {
		if (!verticalContainer) return;
		const el = verticalContainer.querySelector(`[data-page="${pageNum}"]`) as HTMLElement | null;
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function handleVerticalScroll() {
		if (!verticalContainer || !manga) return;
		// Use offsetTop (relative to container) for accuracy
		const centerY = verticalContainer.scrollTop + verticalContainer.clientHeight * 0.4;
		const pageEls = verticalContainer.querySelectorAll('[data-page]');
		for (const el of pageEls) {
			const htmlEl = el as HTMLElement;
			const top = htmlEl.offsetTop;
			const bottom = top + htmlEl.offsetHeight;
			if (top <= centerY && bottom > centerY) {
				const p = parseInt(htmlEl.dataset.page ?? '1');
				if (p !== currentPage) {
					currentPage = p;
					updateProgress();
				}
				break;
			}
		}
	}

	onMount(async () => {
		if (manga) {
			const pageParam = page.url.searchParams.get('page');
			currentPage = pageParam ? Math.max(1, parseInt(pageParam)) : (manga.lastReadPage || 1);
			await loadMangaFile();
		}
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		// Register touchmove as non-passive so we can preventDefault for pinch zoom
		const root = document.getElementById('reader-root');
		root?.addEventListener('touchmove', handleTouchMove, { passive: false });
	});

	onDestroy(() => {
		renderCancelled = true;
		document.removeEventListener('keydown', handleKeyDown);
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		const root = document.getElementById('reader-root');
		root?.removeEventListener('touchmove', handleTouchMove);
		clearTimeout(controlsTimeout);
		document.body.style.overflow = '';
	});

	// ── Keyboard ──────────────────────────────────────────────────────────

	function handleKeyDown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		switch (e.key) {
			case 'ArrowRight':
			case 'l':
				if (readingMode !== 'vertical') readingMode === 'rtl' ? prevPage() : nextPage();
				break;
			case 'ArrowLeft':
			case 'h':
				if (readingMode !== 'vertical') readingMode === 'rtl' ? nextPage() : prevPage();
				break;
			case 'ArrowDown':
			case 'j':
				readingMode === 'vertical'
					? verticalContainer?.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
					: prevPage();
				break;
			case 'ArrowUp':
			case 'k':
				readingMode === 'vertical'
					? verticalContainer?.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
					: nextPage();
				break;
			case '=':
			case '+': zoomIn(); break;
			case '-': zoomOut(); break;
			case '0': resetZoom(); break;
			case 'Escape': sidebarOpen = false; break;
			case 'f': toggleFullscreen(); break;
			case 'm': cycleModes(); break;
		}
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	function cycleModes() {
		const idx = READING_MODES.findIndex(m => m.value === readingMode);
		readingMode = READING_MODES[(idx + 1) % READING_MODES.length].value;
	}

	// ── Zoom ──────────────────────────────────────────────────────────────

	function zoomIn()    { zoomLevel = Math.min(MAX_ZOOM, parseFloat((zoomLevel + ZOOM_STEP).toFixed(2))); }
	function zoomOut()   { zoomLevel = Math.max(MIN_ZOOM, parseFloat((zoomLevel - ZOOM_STEP).toFixed(2))); }
	function resetZoom() { zoomLevel = 1.0; }

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			e.deltaY < 0 ? zoomIn() : zoomOut();
		}
	}

	// ── Touch ─────────────────────────────────────────────────────────────

	function handleTouchStart(e: TouchEvent) {
		activeTouches = e.touches.length;
		if (e.touches.length === 2) {
			pinchStartDist = Math.hypot(
				e.touches[1].clientX - e.touches[0].clientX,
				e.touches[1].clientY - e.touches[0].clientY
			);
			pinchStartZoom = zoomLevel;
			return;
		}
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchMove(e: TouchEvent) {
		if (e.touches.length === 2) {
			e.preventDefault(); // works because listener is non-passive
			const dist = Math.hypot(
				e.touches[1].clientX - e.touches[0].clientX,
				e.touches[1].clientY - e.touches[0].clientY
			);
			zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
				parseFloat((pinchStartZoom * (dist / pinchStartDist)).toFixed(2))
			));
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (activeTouches >= 2) { activeTouches = 0; return; }
		activeTouches = 0;
		if (zoomLevel > 1.05) return; // when zoomed, allow native pan

		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;

		if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
			isControlsVisible = !isControlsVisible;
			return;
		}
		if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) || readingMode === 'vertical') return;
		dx < 0
			? (readingMode === 'rtl' ? prevPage() : nextPage())
			: (readingMode === 'rtl' ? nextPage() : prevPage());
	}

	// ── File / Permission ─────────────────────────────────────────────────

	async function loadMangaFile() {
		if (!manga) return;
		const handle = await PersistenceService.getHandle(manga.id);
		if (!handle) {
			error = 'Nenhuma permissão salva para este arquivo. Selecione o PDF manualmente.';
			isLoading = false;
			return;
		}
		try {
			// queryPermission does NOT require a user gesture — just checks current state
			const status = await (handle as any).queryPermission({ mode: 'read' });
			if (status === 'granted') {
				await openFile(handle as FileSystemFileHandle);
			} else {
				// Need a user gesture to call requestPermission — show a button
				needsPermission = true;
				isLoading = false;
			}
		} catch {
			// queryPermission not supported (older browsers) — try opening directly
			await openFile(handle as FileSystemFileHandle);
		}
	}

	async function openFile(handle: FileSystemFileHandle) {
		try {
			const file = await handle.getFile();
			pdfDoc = await PDFService.loadDocument(file);
			await renderPage();
			isLoading = false;
		} catch (err: any) {
			error = err?.name === 'NotFoundError'
				? 'Arquivo não encontrado. Ele pode ter sido movido ou excluído. Selecione-o novamente abaixo.'
				: 'Não foi possível abrir o PDF. O arquivo pode estar corrompido.';
			isLoading = false;
		}
	}

	async function grantPermission() {
		if (!manga) return;
		const handle = await PersistenceService.getHandle(manga.id);
		if (!handle) { needsPermission = false; error = 'Handle perdido. Selecione o arquivo novamente.'; return; }
		try {
			const status = await (handle as any).requestPermission({ mode: 'read' });
			if (status === 'granted') {
				needsPermission = false;
				isLoading = true;
				await openFile(handle as FileSystemFileHandle);
			} else {
				needsPermission = false;
				error = 'Acesso negado pelo navegador. Selecione o arquivo manualmente.';
			}
		} catch {
			needsPermission = false;
			error = 'Erro ao solicitar permissão. Selecione o arquivo manualmente.';
		}
	}

	async function handleReupload() {
		if (!manga) return;
		try {
			const [handle] = await (window as any).showOpenFilePicker({
				types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
			});
			await PersistenceService.saveHandle(manga.id, handle);
			mangaStore.markHasHandle(manga.id);
			error = null;
			isLoading = true;
			await openFile(handle);
		} catch (e: any) {
			if (e?.name !== 'AbortError') error = 'Não foi possível abrir o arquivo selecionado.';
		}
	}

	// ── Rendering ─────────────────────────────────────────────────────────

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
		if (manga) mangaStore.updateProgress(manga.id, currentPage, manga.totalPage || 100);
	}

	function toggleFullscreen() {
		document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
	}

	async function goToPage(num: number) {
		currentPage = num;
		sidebarOpen = false;
		if (readingMode === 'vertical') {
			await tick();
			scrollToPage(num);
			updateProgress();
		} else {
			isLoading = true;
			await renderPage();
			updateProgress();
			isLoading = false;
		}
	}

	async function handleProgressBarClick(e: MouseEvent) {
		if (!manga?.totalPage) return;
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		const ratio = (e.clientX - rect.left) / rect.width;
		const targetPage = Math.max(1, Math.min(manga.totalPage, Math.round(ratio * manga.totalPage)));
		await goToPage(targetPage);
	}

	const zoomPercent = $derived(Math.round(zoomLevel * 100));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	id="reader-root"
	class="fixed inset-0 bg-[#050505] text-white flex flex-col overflow-hidden select-none font-body"
	role="application"
	aria-label="Leitor de mangá"
	onmousemove={handleMouseMove}
	onwheel={handleWheel}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<!-- Header -->
	<header
		class={cn(
			"absolute top-0 left-0 w-full z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between transition-all duration-500",
			!isControlsVisible && "-translate-y-full opacity-0"
		)}
	>
		<div class="flex items-center gap-3">
			<a href="{base}/manga/{id}" class="p-2 hover:bg-white/10 rounded-full transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<div class="hidden sm:block">
				<h2 class="font-bold text-sm line-clamp-1 font-display">{manga?.title}</h2>
				<p class="text-[10px] text-white/50 uppercase tracking-widest leading-none mt-0.5 font-mono">
					{#if readingMode === 'vertical'}
						Scroll · {manga?.totalPage} páginas
					{:else}
						Página {currentPage} de {manga?.totalPage}
					{/if}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1">
			<!-- Reading mode -->
			<div class="hidden sm:flex items-center gap-0.5 bg-white/5 rounded-lg p-1 mr-1">
				{#each READING_MODES as mode}
					<button
						onclick={() => (readingMode = mode.value)}
						class={cn(
							'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-all',
							readingMode === mode.value ? 'bg-[var(--accent)] text-white' : 'text-white/40 hover:text-white/80'
						)}
					>{mode.label}</button>
				{/each}
			</div>
			<button onclick={cycleModes} class="sm:hidden px-2 py-1 rounded bg-white/5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] mr-1">
				{readingMode === 'horizontal' ? 'LTR' : readingMode === 'rtl' ? 'RTL' : 'Scroll'}
			</button>

			<!-- Zoom controls -->
			<div class="flex items-center gap-0.5 bg-white/5 rounded-lg p-1 mr-1">
				<button onclick={zoomOut} disabled={zoomLevel <= MIN_ZOOM} class="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition-colors" title="Zoom − (tecla -)">
					<ZoomOut class="w-3.5 h-3.5" />
				</button>
				<button onclick={resetZoom} class="px-2 py-1 rounded text-[10px] font-mono text-white/60 hover:text-white hover:bg-white/10 transition-colors min-w-[3rem] text-center" title="Resetar zoom (tecla 0)">
					{zoomPercent}%
				</button>
				<button onclick={zoomIn} disabled={zoomLevel >= MAX_ZOOM} class="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition-colors" title="Zoom + (tecla +)">
					<ZoomIn class="w-3.5 h-3.5" />
				</button>
			</div>

			<button class="p-2 hover:bg-white/10 rounded-full transition-colors" onclick={() => (sidebarOpen = !sidebarOpen)}>
				<Menu class="w-5 h-5" />
			</button>
			<a href="{base}/settings" class="hidden sm:flex p-2 hover:bg-white/10 rounded-full transition-colors">
				<Settings class="w-5 h-5" />
			</a>
			<button class="p-2 hover:bg-white/10 rounded-full transition-colors" onclick={toggleFullscreen}>
				{#if isFullscreen}<Minimize2 class="w-5 h-5" />{:else}<Maximize2 class="w-5 h-5" />{/if}
			</button>
		</div>
	</header>

	<!-- Content area -->
	{#if isLoading}
		<div class="flex-grow flex flex-col items-center justify-center gap-6">
			<div class="relative">
				<Loader2 class="w-16 h-16 text-[var(--accent)] animate-spin opacity-20" />
				<Loader2 class="absolute inset-0 w-16 h-16 text-[var(--accent)] animate-spin [animation-delay:-0.5s]" />
			</div>
			<p class="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Carregando PDF</p>
		</div>

	{:else if needsPermission}
		<!-- Permission request (handle exists but browser needs user gesture) -->
		<div class="flex-grow flex items-center justify-center p-4">
			<div class="max-w-sm w-full p-10 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl flex flex-col items-center text-center gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
				<div class="w-16 h-16 bg-[var(--accent)]/10 rounded-full flex items-center justify-center text-[var(--accent)]">
					<KeyRound class="w-8 h-8" />
				</div>
				<div>
					<h3 class="font-bold text-lg mb-2">Confirmar Acesso</h3>
					<p class="text-sm text-[var(--text-secondary)]">O navegador precisa da sua confirmação para acessar este arquivo. Clique no botão abaixo.</p>
				</div>
				<button onclick={grantPermission} class="btn-primary w-full flex items-center justify-center gap-3 py-4">
					<KeyRound class="w-5 h-5" />
					CONCEDER ACESSO
				</button>
				<button onclick={handleReupload} class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors underline underline-offset-2">
					Selecionar outro arquivo
				</button>
			</div>
		</div>

	{:else if error}
		<div class="flex-grow flex items-center justify-center p-4">
			<div class="max-w-md w-full p-10 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl flex flex-col items-center text-center gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
				<div class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
					<AlertCircle class="w-8 h-8" />
				</div>
				<div>
					<h3 class="font-bold text-lg mb-2">Arquivo não disponível</h3>
					<p class="text-sm text-[var(--text-secondary)]">{error}</p>
				</div>
				<button onclick={handleReupload} class="btn-primary w-full flex items-center justify-center gap-3 py-4">
					<FileUp class="w-5 h-5" />
					SELECIONAR ARQUIVO
				</button>
			</div>
		</div>

	{:else if readingMode === 'vertical'}
		<!-- VERTICAL CONTINUOUS SCROLL -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="flex-grow overflow-y-auto overflow-x-auto pt-14 pb-4"
			bind:this={verticalContainer}
			onscroll={handleVerticalScroll}
			onclick={() => (isControlsVisible = !isControlsVisible)}
		>
			<!-- Inner column: max-width 900 px at zoom=1, scales with zoom -->
			<div
				class="flex flex-col mx-auto"
				style="width: 100%; max-width: {Math.round(zoomLevel * 900)}px;"
			>
				{#each verticalPages as src, i}
					<div class="w-full" data-page={i + 1}>
						{#if src}
							<img
								src={src}
								alt="Página {i + 1}"
								class="w-full h-auto block"
								draggable="false"
							/>
						{:else}
							<div class="w-full aspect-[3/4] bg-white/[0.03] flex items-center justify-center">
								<Loader2 class="w-5 h-5 text-white/20 animate-spin" />
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

	{:else}
		<!-- HORIZONTAL MODE (LTR / RTL) -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="flex-grow flex items-center justify-center overflow-auto p-4"
			onclick={() => (isControlsVisible = !isControlsVisible)}
		>
			<div
				class="relative shadow-[0_0_100px_rgba(0,0,0,0.5)]"
				style="transform: scale({zoomLevel}); transform-origin: center center; transition: transform 0.15s ease;"
			>
				{#if pageImage}
					<img
						src={pageImage}
						alt="Página {currentPage}"
						class={cn("max-h-[90vh] w-auto animate-in fade-in duration-200", readingMode === 'rtl' && "[transform:scaleX(-1)]")}
						draggable="false"
					/>
				{:else}
					<div class="bg-white w-full max-w-2xl aspect-[3/4] flex items-center justify-center text-black/20 text-9xl font-display italic">
						{currentPage}
					</div>
				{/if}

				{#if zoomLevel <= 1.05}
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
		</div>
	{/if}

	<!-- Progress footer (horizontal modes only) -->
	{#if readingMode !== 'vertical' && !isLoading && !error && !needsPermission}
		<footer
			class={cn(
				"absolute bottom-0 left-0 w-full z-50 bg-black/80 backdrop-blur-xl border-t border-white/10 px-8 py-4 transition-all duration-500",
				!isControlsVisible && "translate-y-full opacity-0"
			)}
		>
			<div class="max-w-4xl mx-auto flex items-center gap-6">
				<span class="text-[10px] font-mono text-white/30 w-6 text-right">{currentPage}</span>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex-grow h-3 bg-white/5 rounded-full relative cursor-pointer group" onclick={handleProgressBarClick}>
					<div class="h-full bg-[var(--accent)] rounded-full transition-all duration-300 pointer-events-none" style="width:{(currentPage / (manga?.totalPage || 1)) * 100}%"></div>
				</div>
				<span class="text-[10px] font-mono text-white/30 w-6">{manga?.totalPage}</span>
			</div>
			<p class="hidden sm:block text-center text-[9px] text-white/15 mt-1.5 uppercase tracking-widest font-mono">
				← → navegar &nbsp;·&nbsp; +/- zoom &nbsp;·&nbsp; 0 reset &nbsp;·&nbsp; M modo &nbsp;·&nbsp; F fullscreen
			</p>
			<p class="sm:hidden text-center text-[9px] text-white/15 mt-1.5 uppercase tracking-widest font-mono">
				deslize para navegar · belisque para zoom
			</p>
		</footer>
	{/if}

	<!-- Vertical mode progress bar (thin line at bottom) -->
	{#if readingMode === 'vertical' && !isLoading && !error && !needsPermission}
		<div class={cn("absolute bottom-0 left-0 w-full z-50 h-1 bg-white/5 transition-opacity duration-500", !isControlsVisible && "opacity-0")}>
			<div class="h-full bg-[var(--accent)] transition-all duration-300" style="width:{(currentPage / (manga?.totalPage || 1)) * 100}%"></div>
		</div>
	{/if}

	<!-- Sidebar -->
	<aside class={cn("fixed top-0 right-0 h-full w-80 bg-black/95 backdrop-blur-2xl border-l border-white/10 z-[100] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[-20px_0_50px_rgba(0,0,0,0.5)]", !sidebarOpen && "translate-x-full")}>
		<div class="p-6 flex items-center justify-between border-b border-white/10">
			<h3 class="font-bold uppercase tracking-[0.2em] text-[10px] text-[var(--accent)]">Navegação</h3>
			<button onclick={() => (sidebarOpen = false)} class="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
				<X class="w-5 h-5" />
			</button>
		</div>

		<div class="p-5 overflow-y-auto h-[calc(100%-72px)] custom-scrollbar">
			{#if manga?.coverUrl}
				<div class="aspect-[3/4] mb-6 relative rounded-xl overflow-hidden border border-white/10">
					<img src={manga.coverUrl} alt={manga.title} class="w-full h-full object-cover opacity-40 grayscale hover:grayscale-0 transition-all duration-500" />
					<div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
					<div class="absolute bottom-0 left-0 w-full p-4">
						<h4 class="font-display font-bold text-base leading-tight mb-0.5">{manga.title}</h4>
						<p class="text-[10px] text-white/40 uppercase tracking-widest font-mono">{manga.author}</p>
					</div>
				</div>
			{/if}

			<div class="flex items-center justify-between mb-3 px-1">
				<span class="text-[10px] font-bold uppercase tracking-widest text-white/30">Capítulos</span>
				<span class="text-[10px] font-mono text-white/30">{manga?.bookmarks?.length || 0}</span>
			</div>

			<div class="flex flex-col gap-2">
				{#each manga?.bookmarks || [] as chapter, i}
					<button
						onclick={() => goToPage(chapter.pageNumber)}
						class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group active:scale-[0.98]"
					>
						<div class="flex items-center gap-3">
							<span class="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[9px] font-bold text-[var(--accent)]">
								{String(i + 1).padStart(2, '0')}
							</span>
							<div>
								<span class="text-sm font-bold block leading-none">{chapter.title}</span>
								<span class="text-[9px] text-white/30 uppercase tracking-widest mt-0.5 block">Pág. {chapter.pageNumber}</span>
							</div>
						</div>
						<BookOpen class={cn("w-4 h-4 transition-colors", currentPage >= chapter.pageNumber ? "text-[var(--accent)]" : "text-white/20")} />
					</button>
				{:else}
					<p class="text-[10px] text-center text-white/20 py-8 uppercase tracking-widest">Nenhum capítulo detectado</p>
				{/each}
			</div>
		</div>
	</aside>
</div>

<style>
	:global(body) { overflow: hidden; background: #000; }
	.custom-scrollbar::-webkit-scrollbar { width: 2px; }
	.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
	.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>
