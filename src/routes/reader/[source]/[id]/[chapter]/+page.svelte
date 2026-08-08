<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { ApiError, BackendApiService, resolveImageUrl, type Chapter } from '$lib/services/api';
	import { offlineService } from '$lib/services/offline';
	import { preferences, type ReadingMode } from '$lib/stores/preferences.svelte';
	import { pushBackHandler } from '$lib/services/backButton';
	import {
		ArrowLeft,
		Menu,
		Settings,
		ChevronLeft,
		ChevronRight,
		Maximize2,
		Minimize2,
		X,
		Loader2,
		AlertCircle,
		ZoomIn,
		ZoomOut,
		WifiOff,
		List
	} from 'lucide-svelte';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { cn } from '$lib/utils';

	const source = $derived(page.params.source ?? '');
	const id = $derived(page.params.id ?? '');
	const chapterId = $derived(page.params.chapter ?? '');

	const manga = $derived(mangaStore.find(id, source));

	let pageUrls = $state<string[]>([]);
	let isOfflineSource = $state(false);
	let currentPage = $state(1);
	let isControlsVisible = $state(true);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	// Modo de leitura vem das preferencias: escolher "Scroll" uma vez vale para
	// os proximos capitulos tambem.
	const readingMode = $derived(preferences.readingMode);
	let sidebarOpen = $state(false);
	let sidebarTab = $state<'chapters' | 'settings'>('chapters');
	let isFullscreen = $state(false);

	// Lista de capitulos, usada para navegar entre eles sem sair do leitor.
	let chapters = $state<Chapter[]>([]);
	const chapterIndex = $derived(chapters.findIndex((c) => c.source_id === chapterId));
	const prevChapter = $derived(chapterIndex > 0 ? chapters[chapterIndex - 1] : null);
	const nextChapter = $derived(
		chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null
	);
	const currentChapter = $derived(chapterIndex >= 0 ? chapters[chapterIndex] : null);
	const chapterLabel = $derived(
		currentChapter?.chapter ? `Cap. ${currentChapter.chapter}` : (currentChapter?.title ?? '')
	);

	let zoomLevel = $state(1.0);
	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 4.0;
	const ZOOM_STEP = 0.25;

	let pinchStartDist = 0;
	let pinchStartZoom = 1.0;
	let activeTouches = 0;

	let verticalContainer = $state<HTMLElement | null>(null);

	let controlsTimeout: ReturnType<typeof setTimeout>;
	let touchStartX = 0;
	let touchStartY = 0;

	const READING_MODES: { value: ReadingMode; label: string }[] = [
		{ value: 'rtl', label: 'Paginado' },
		{ value: 'vertical', label: 'Scroll' }
	];

	/**
	 * Object URLs precisam ser revogados na troca de capitulo, senao vazam memoria.
	 *
	 * Le o estado com `untrack`: chamado de dentro do $effect de carga, uma
	 * leitura rastreada de `pageUrls`/`isOfflineSource` vira dependencia do
	 * proprio effect que as escreve — o effect reexecutava e revogava as blob
	 * URLs que tinham acabado de ser criadas, e o capitulo baixado nao abria mais.
	 */
	function releasePages() {
		untrack(() => {
			if (isOfflineSource) offlineService.revokePages(pageUrls);
		});
		pageUrls = [];
	}

	/**
	 * Cada carga recebe um token; respostas de uma carga antiga sao descartadas.
	 * Sem isso, trocar de capitulo rapido deixava as paginas do capitulo anterior
	 * sobrescreverem as do atual.
	 */
	let loadToken = 0;

	async function loadChapter(currentSource: string, mangaId: string, currentChapterId: string) {
		const token = ++loadToken;
		releasePages();
		isLoading = true;
		error = null;
		currentPage = 1;

		try {
			const downloaded = await offlineService.isChapterDownloaded(
				currentSource,
				mangaId,
				currentChapterId
			);

			let urls: string[];
			let offline: boolean;

			if (downloaded) {
				urls = await offlineService.getOfflinePages(currentSource, mangaId, currentChapterId);
				offline = true;
			} else {
				const res = await BackendApiService.getPages(currentSource, currentChapterId);
				urls = res.page_urls
					.map((url) => resolveImageUrl(url))
					.filter((url): url is string => !!url);
				offline = false;
			}

			// Carga obsoleta: descarta e devolve os blobs que criamos por nada.
			if (token !== loadToken) {
				if (offline) offlineService.revokePages(urls);
				return;
			}

			pageUrls = urls;
			isOfflineSource = offline;

			if (urls.length === 0) {
				error = 'Este capítulo não tem páginas disponíveis nesta fonte.';
				return;
			}

			// Retoma na pagina salva quando o progresso e deste capitulo; senao
			// abrir o capitulo de novo jogava a leitura de volta para a pagina 1.
			const saved = untrack(() => mangaStore.find(mangaId, currentSource));
			const resumePage =
				saved?.lastChapterId === currentChapterId
					? Math.min(Math.max(saved.lastReadPage || 1, 1), urls.length)
					: 1;
			currentPage = resumePage;

			mangaStore.updateProgress(mangaId, currentSource, resumePage, urls.length, {
				id: currentChapterId
			});
		} catch (err) {
			if (token !== loadToken) return;
			console.error(err);
			error = err instanceof ApiError ? err.message : 'Falha ao carregar as páginas do capítulo.';
		} finally {
			if (token === loadToken) isLoading = false;
		}
	}

	$effect(() => {
		const currentSource = source;
		const mangaId = id;
		const currentChapterId = chapterId;
		if (!currentSource || !mangaId || !currentChapterId) return;

		loadChapter(currentSource, mangaId, currentChapterId);
	});

	// Lista de capitulos é independente das paginas: carrega uma vez por mangá.
	$effect(() => {
		const currentSource = source;
		const mangaId = id;
		if (!currentSource || !mangaId) return;

		BackendApiService.getChapters(currentSource, mangaId)
			.then((res) => (chapters = res))
			.catch((err) => console.error('Falha ao carregar lista de capítulos', err));
	});

	// Mantem o rotulo do capitulo na biblioteca assim que ele é conhecido.
	$effect(() => {
		if (chapterLabel && manga) {
			mangaStore.updateMeta(id, source, { lastChapterLabel: chapterLabel });
		}
	});

	function goToChapter(target: Chapter | null) {
		if (!target) return;
		sidebarOpen = false;
		goto(resolve(`/reader/${source}/${id}/${target.source_id}`));
	}

	function resetControlsTimeout() {
		clearTimeout(controlsTimeout);
		if (isControlsVisible && !sidebarOpen) {
			controlsTimeout = setTimeout(() => {
				isControlsVisible = false;
			}, 3000);
		}
	}

	function toggleControls() {
		isControlsVisible = !isControlsVisible;
		if (isControlsVisible) resetControlsTimeout();
	}

	function handleMouseMove() {
		if (!isControlsVisible) isControlsVisible = true;
		resetControlsTimeout();
	}

	function setPage(value: number) {
		currentPage = value;
		mangaStore.updateProgress(id, source, value, pageUrls.length, { id: chapterId });

		// Ultima pagina alcancada: capitulo conta como lido.
		if (value >= pageUrls.length) {
			mangaStore.markChapterRead(id, source, chapterId);
		}
	}

	function next() {
		if (readingMode === 'vertical') return;
		if (currentPage < pageUrls.length) {
			setPage(currentPage + 1);
		} else if (nextChapter) {
			goToChapter(nextChapter);
		}
	}

	function prev() {
		if (readingMode === 'vertical') return;
		if (currentPage > 1) {
			setPage(currentPage - 1);
		} else if (prevChapter) {
			goToChapter(prevChapter);
		}
	}

	// Toque/clique/seta do lado direito ou esquerdo, respeitando o sentido de leitura.
	function pageRight() {
		if (readingMode === 'rtl') prev();
		else next();
	}

	function pageLeft() {
		if (readingMode === 'rtl') next();
		else prev();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') {
			pageRight();
		} else if (e.key === 'ArrowLeft') {
			pageLeft();
		} else if (e.key === 'f') {
			toggleFullscreen();
		} else if (e.key === 'Escape') {
			isControlsVisible = true;
			sidebarOpen = false;
		} else if (e.key === '+' || e.key === '=') {
			zoomIn();
		} else if (e.key === '-') {
			zoomOut();
		}
	}

	function handleTouchStart(e: TouchEvent) {
		activeTouches = e.touches.length;
		if (activeTouches === 1) {
			touchStartX = e.touches[0].clientX;
			touchStartY = e.touches[0].clientY;
		} else if (activeTouches === 2) {
			pinchStartDist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY
			);
			pinchStartZoom = zoomLevel;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (activeTouches === 2) {
			e.preventDefault();
			const dist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY
			);
			const scale = dist / pinchStartDist;
			zoomLevel = Math.min(Math.max(MIN_ZOOM, pinchStartZoom * scale), MAX_ZOOM);
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (activeTouches === 2) {
			activeTouches = e.touches.length;
			return;
		}
		activeTouches = e.touches.length;

		if (readingMode === 'vertical') return;

		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;

		if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
			toggleControls();
			return;
		}

		if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
			if (dx > 0) pageLeft();
			else pageRight();
		}
	}

	async function toggleFullscreen() {
		if (!document.fullscreenElement) {
			await document.documentElement.requestFullscreen().catch(() => {});
			isFullscreen = true;
		} else {
			await document.exitFullscreen().catch(() => {});
			isFullscreen = false;
		}
	}

	function zoomIn() {
		zoomLevel = Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM);
	}

	function zoomOut() {
		zoomLevel = Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM);
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	let releaseBackHandler: (() => void) | null = null;

	onMount(() => {
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		resetControlsTimeout();

		// No leitor o "voltar" fecha primeiro o que estiver por cima; so depois
		// deixa o layout tratar a navegacao.
		releaseBackHandler = pushBackHandler(() => {
			if (sidebarOpen) {
				sidebarOpen = false;
				return true;
			}
			if (isFullscreen) {
				void document.exitFullscreen().catch(() => {});
				return true;
			}
			return false;
		});
	});

	onDestroy(() => {
		clearTimeout(controlsTimeout);
		if (typeof document !== 'undefined') {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		}
		releaseBackHandler?.();
		releasePages();
	});

	function handleVerticalScroll(e: Event) {
		if (pageUrls.length === 0) return;
		const target = e.target as HTMLElement;
		// `[data-page]` e nao `img`: paginas faltando num capitulo parcial viram
		// placeholder e o indice do `img` deixaria de bater com o numero da pagina.
		const slots = target.querySelectorAll<HTMLElement>('[data-page]');
		const middle = window.innerHeight / 2;

		for (const slot of slots) {
			const rect = slot.getBoundingClientRect();
			if (rect.top <= middle && rect.bottom >= middle) {
				const value = Number(slot.dataset.page);
				if (value && currentPage !== value) setPage(value);
				break;
			}
		}
	}

	/**
	 * Retoma a leitura onde parou, no modo scroll.
	 *
	 * So dispara uma vez por capitulo (`restoredFor`): depois disso quem manda na
	 * posicao e o usuario, e rolar de volta ao ponto salvo a cada re-render
	 * prenderia a tela.
	 */
	let restoredFor = $state<string | null>(null);

	$effect(() => {
		const container = verticalContainer;
		const total = pageUrls.length;
		const currentChapterId = chapterId;

		if (readingMode !== 'vertical' || !container || total === 0) return;
		if (restoredFor === currentChapterId) return;

		restoredFor = currentChapterId;

		// So retoma se o progresso salvo for deste capitulo.
		const saved = untrack(() => manga);
		if (saved?.lastChapterId !== currentChapterId) return;
		const targetPage = saved.lastReadPage;
		if (!targetPage || targetPage <= 1) return;

		// Espera o layout assentar antes de medir a posicao do alvo.
		requestAnimationFrame(() => {
			const slot = container.querySelector<HTMLElement>(`[data-page="${targetPage}"]`);
			slot?.scrollIntoView({ block: 'start' });
		});
	});
</script>

<svelte:window onkeydown={handleKeyDown} onmousemove={handleMouseMove} />

<div class="fixed inset-0 overflow-hidden bg-[var(--bg-primary)] select-none">
	{#if isLoading}
		<div class="flex h-full flex-col items-center justify-center gap-4 text-[var(--text-primary)]">
			<Loader2 class="h-12 w-12 animate-spin text-[var(--accent)]" />
			<p class="font-bold tracking-widest uppercase">Carregando capítulo...</p>
		</div>
	{:else if error}
		<div
			class="flex h-full flex-col items-center justify-center p-6 text-center text-[var(--text-primary)]"
		>
			<div class="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-red-500/10">
				<AlertCircle class="h-12 w-12 text-red-500" />
			</div>
			<h2 class="mb-2 text-2xl font-bold">Erro de Leitura</h2>
			<p class="mb-8 text-[var(--text-secondary)]">{error}</p>
			<a href={resolve(`/manga/${source}/${id}`)} class="btn-primary"> Voltar ao Mangá </a>
		</div>
	{:else}
		<!-- TOP BAR -->
		<div
			class={cn(
				'absolute top-0 right-0 left-0 z-50 flex transform items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4 px-6 text-white transition-all duration-300',
				isControlsVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
			)}
		>
			<div class="flex min-w-0 items-center gap-4">
				<a
					href={resolve(`/manga/${source}/${id}`)}
					class="rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={(e) => e.stopPropagation()}
				>
					<ArrowLeft class="h-6 w-6" />
				</a>
				<div class="min-w-0">
					<!-- Titulo tambem leva ao manga: no celular o alvo de toque da seta
					     e pequeno, e é o gesto que o usuario tenta primeiro. -->
					<a
						href={resolve(`/manga/${source}/${id}`)}
						class="block transition-opacity hover:opacity-80"
						onclick={(e) => e.stopPropagation()}
					>
						<h1 class="line-clamp-1 font-bold">
							{manga?.title ?? 'Leitura'}
							{#if chapterLabel}
								<span class="opacity-70">— {chapterLabel}</span>
							{/if}
						</h1>
					</a>
					<p class="flex items-center gap-2 text-xs opacity-80">
						Página {currentPage} / {pageUrls.length}
						{#if isOfflineSource}
							<span class="flex items-center gap-1 text-green-400">
								<WifiOff class="h-3 w-3" /> Offline
							</span>
						{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button
					class="rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={(e) => {
						e.stopPropagation();
						zoomOut();
					}}
					disabled={zoomLevel <= MIN_ZOOM}
				>
					<ZoomOut class="h-5 w-5" />
				</button>
				<span class="w-12 text-center text-xs font-bold">{Math.round(zoomLevel * 100)}%</span>
				<button
					class="rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={(e) => {
						e.stopPropagation();
						zoomIn();
					}}
					disabled={zoomLevel >= MAX_ZOOM}
				>
					<ZoomIn class="h-5 w-5" />
				</button>

				<div class="mx-2 h-6 w-px bg-white/20"></div>

				<button
					class="hidden rounded-full p-2 transition-colors hover:bg-white/20 sm:block"
					onclick={(e) => {
						e.stopPropagation();
						toggleFullscreen();
					}}
				>
					{#if isFullscreen}
						<Minimize2 class="h-5 w-5" />
					{:else}
						<Maximize2 class="h-5 w-5" />
					{/if}
				</button>
				<button
					class="rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={(e) => {
						e.stopPropagation();
						sidebarOpen = true;
					}}
				>
					<Menu class="h-5 w-5" />
				</button>
			</div>
		</div>

		<!-- READER AREA -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class={cn(
				'h-full w-full overflow-hidden transition-all duration-300',
				sidebarOpen ? 'mr-80' : ''
			)}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			onmousedown={(e) => {
				if (readingMode !== 'vertical' && e.button === 0) {
					const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
					const x = e.clientX - rect.left;
					if (x < rect.width / 3) {
						pageLeft();
					} else if (x > (rect.width * 2) / 3) {
						pageRight();
					} else {
						toggleControls();
					}
				}
			}}
		>
			{#if readingMode === 'vertical'}
				<div
					bind:this={verticalContainer}
					class="h-full w-full overflow-x-hidden overflow-y-auto bg-[var(--bg-secondary)]"
					onscroll={handleVerticalScroll}
				>
					<div class="mx-auto flex w-full flex-col items-center pb-24 md:max-w-[720px]">
						<!-- Chave pelo indice: em capitulo parcial as paginas que faltam sao
						     string vazia, e uma chave duplicada derruba o each. -->
						{#each pageUrls as url, i (i)}
							{#if url}
								<img
									data-page={i + 1}
									src={url}
									alt={`Página ${i + 1}`}
									class="h-auto w-full origin-top"
									style="width: {zoomLevel * 100}%;"
									loading={i < 3 ? 'eager' : 'lazy'}
								/>
							{:else}
								<div
									data-page={i + 1}
									class="flex aspect-[2/3] w-full items-center justify-center text-sm text-[var(--text-muted)]"
								>
									Página {i + 1} indisponível
								</div>
							{/if}
						{/each}

						<!-- Fim do capitulo: continuar sem voltar para a lista -->
						<div class="flex w-full flex-col items-center gap-3 px-6 py-12">
							{#if nextChapter}
								<button
									class="btn-primary w-full max-w-sm"
									onclick={() => goToChapter(nextChapter)}
								>
									Próximo capítulo
								</button>
							{:else}
								<p class="text-sm text-[var(--text-muted)]">Você chegou ao último capítulo.</p>
							{/if}
							<a
								href={resolve(`/manga/${source}/${id}`)}
								class="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]"
							>
								Voltar aos capítulos
							</a>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex h-full w-full items-center justify-center p-4">
					<div class="relative flex h-full w-full items-center justify-center overflow-auto">
						<img
							src={pageUrls[currentPage - 1]}
							alt={`Página ${currentPage}`}
							class="max-h-full max-w-full object-contain transition-transform"
							style="transform: scale({zoomLevel});"
						/>
					</div>
				</div>
			{/if}
		</div>

		<!-- BOTTOM NAV -->
		{#if readingMode !== 'vertical'}
			<div
				class={cn(
					'absolute right-0 bottom-0 left-0 z-50 flex transform items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-6 text-white transition-all duration-300',
					isControlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
					sidebarOpen ? 'mr-80' : ''
				)}
			>
				<button
					class="flex items-center gap-2 rounded-full p-3 transition-colors hover:bg-white/20 disabled:opacity-50"
					onclick={(e) => {
						e.stopPropagation();
						pageLeft();
					}}
					disabled={readingMode === 'rtl'
						? currentPage >= pageUrls.length && !nextChapter
						: currentPage <= 1 && !prevChapter}
				>
					<ChevronLeft class="h-6 w-6" />
				</button>

				<div class="flex-1 px-8">
					<input
						type="range"
						min="1"
						max={pageUrls.length}
						value={currentPage}
						oninput={(e) => setPage(Number((e.currentTarget as HTMLInputElement).value))}
						class="w-full accent-[var(--accent)]"
						onclick={(e) => e.stopPropagation()}
						dir={readingMode === 'rtl' ? 'rtl' : 'ltr'}
					/>
				</div>

				<button
					class="flex items-center gap-2 rounded-full p-3 transition-colors hover:bg-white/20 disabled:opacity-50"
					onclick={(e) => {
						e.stopPropagation();
						pageRight();
					}}
					disabled={readingMode === 'rtl'
						? currentPage <= 1 && !prevChapter
						: currentPage >= pageUrls.length && !nextChapter}
				>
					<ChevronRight class="h-6 w-6" />
				</button>
			</div>
		{/if}

		<!-- SIDEBAR -->
		{#if sidebarOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="absolute inset-0 z-40 bg-black/50" onclick={() => (sidebarOpen = false)}></div>
		{/if}
		<div
			class={cn(
				'absolute top-0 right-0 bottom-0 z-50 flex w-80 transform flex-col bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-2xl transition-transform duration-300',
				sidebarOpen ? 'translate-x-0' : 'translate-x-full'
			)}
		>
			<div class="flex items-center justify-between border-b border-[var(--border)] p-4">
				<div class="flex gap-1">
					<button
						class={cn(
							'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
							sidebarTab === 'chapters'
								? 'bg-[var(--accent)]/10 text-[var(--accent)]'
								: 'text-[var(--text-secondary)] hover:bg-[var(--bg-accent)]/10'
						)}
						onclick={() => (sidebarTab = 'chapters')}
					>
						<List class="h-4 w-4" /> Capítulos
					</button>
					<button
						class={cn(
							'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
							sidebarTab === 'settings'
								? 'bg-[var(--accent)]/10 text-[var(--accent)]'
								: 'text-[var(--text-secondary)] hover:bg-[var(--bg-accent)]/10'
						)}
						onclick={() => (sidebarTab = 'settings')}
					>
						<Settings class="h-4 w-4" /> Ajustes
					</button>
				</div>
				<button
					class="rounded-full p-2 transition-colors hover:bg-[var(--bg-accent)]/10"
					onclick={() => (sidebarOpen = false)}
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4">
				{#if sidebarTab === 'settings'}
					<h4 class="mb-3 text-xs font-black tracking-widest text-[var(--text-muted)] uppercase">
						Modo de Leitura
					</h4>
					<div class="flex flex-col gap-2">
						{#each READING_MODES as mode (mode.value)}
							<button
								class={cn(
									'rounded-xl border p-3 text-left font-bold transition-colors',
									readingMode === mode.value
										? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
										: 'border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--text-muted)]'
								)}
								onclick={() => preferences.setReadingMode(mode.value)}
							>
								{mode.label}
							</button>
						{/each}
					</div>
				{:else if chapters.length === 0}
					<p class="py-8 text-center text-sm text-[var(--text-muted)]">
						Carregando lista de capítulos...
					</p>
				{:else}
					<div class="flex flex-col gap-1">
						{#each chapters as chapter (chapter.source_id)}
							<button
								class={cn(
									'rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
									chapter.source_id === chapterId
										? 'bg-[var(--accent)]/10 font-bold text-[var(--accent)]'
										: 'hover:bg-[var(--bg-accent)]/10'
								)}
								onclick={() => goToChapter(chapter)}
							>
								<span class="flex items-center justify-between gap-2">
									<span class="truncate">
										{chapter.chapter ? `Cap. ${chapter.chapter}` : (chapter.title ?? 'Capítulo')}
									</span>
									{#if mangaStore.isChapterRead(id, source, chapter.source_id)}
										<span class="text-[10px] tracking-wider text-green-500 uppercase">lido</span>
									{/if}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Navegacao rapida entre capitulos -->
			<div class="flex gap-2 border-t border-[var(--border)] p-4">
				<button
					class="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-bold transition-colors hover:border-[var(--accent)] disabled:opacity-30"
					onclick={() => goToChapter(prevChapter)}
					disabled={!prevChapter}
				>
					Anterior
				</button>
				<button
					class="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-bold transition-colors hover:border-[var(--accent)] disabled:opacity-30"
					onclick={() => goToChapter(nextChapter)}
					disabled={!nextChapter}
				>
					Próximo
				</button>
			</div>
		</div>
	{/if}
</div>
