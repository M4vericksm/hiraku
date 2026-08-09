<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { ApiError, BackendApiService, resolveImageUrl, type Chapter } from '$lib/services/api';
	import { offlineService } from '$lib/services/offline';
	import { preferences, SCROLL_SPEEDS, type ReadingMode } from '$lib/stores/preferences.svelte';
	import { pushBackHandler } from '$lib/services/backButton';
	import {
		ArrowLeft,
		Menu,
		ChevronLeft,
		ChevronRight,
		Maximize2,
		Minimize2,
		X,
		Loader2,
		AlertCircle,
		ZoomIn,
		ZoomOut,
		Play,
		Pause,
		FastForward
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
	const readingMode = $derived(preferences.readingMode);
	let sidebarOpen = $state(false);
	let sidebarTab = $state<'chapters' | 'settings'>('chapters');
	let isFullscreen = $state(false);

	// Estado do Auto-Scroll
	let isAutoScrolling = $state(false);
	let autoScrollAnimationId: number | null = null;
	let autoScrollIntervalId: ReturnType<typeof setInterval> | null = null;

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

	const READING_MODES: { value: ReadingMode; label: string; kanji: string }[] = [
		{ value: 'rtl', label: 'Paginado (RTL Mangá)', kanji: '頁' },
		{ value: 'vertical', label: 'Scroll Contínuo', kanji: '巻' }
	];

	function releasePages() {
		untrack(() => {
			if (isOfflineSource) offlineService.revokePages(pageUrls);
		});
		pageUrls = [];
	}

	let loadToken = 0;

	async function loadChapter(currentSource: string, mangaId: string, currentChapterId: string) {
		const token = ++loadToken;
		releasePages();
		isLoading = true;
		error = null;
		currentPage = 1;
		isAutoScrolling = false;

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

	$effect(() => {
		const currentSource = source;
		const mangaId = id;
		if (!currentSource || !mangaId) return;

		BackendApiService.getChapters(currentSource, mangaId)
			.then((res) => (chapters = res))
			.catch((err) => console.error('Falha ao carregar lista de capítulos', err));
	});

	$effect(() => {
		if (chapterLabel && manga) {
			mangaStore.updateMeta(id, source, { lastChapterLabel: chapterLabel });
		}
	});

	// Motor Reativo de Auto-Scroll
	$effect(() => {
		if (!isAutoScrolling || isLoading || !!error || pageUrls.length === 0) {
			if (autoScrollAnimationId) {
				cancelAnimationFrame(autoScrollAnimationId);
				autoScrollAnimationId = null;
			}
			if (autoScrollIntervalId) {
				clearInterval(autoScrollIntervalId);
				autoScrollIntervalId = null;
			}
			return;
		}

		if (readingMode === 'vertical') {
			let lastTimestamp = performance.now();
			const scrollStep = (now: number) => {
				const delta = (now - lastTimestamp) / 1000;
				lastTimestamp = now;
				if (verticalContainer) {
					const speed = preferences.scrollSpeed.pixelsPerSecond;
					verticalContainer.scrollTop += speed * delta;

					// Se chegou ao fim do container vertical
					const atBottom =
						verticalContainer.scrollHeight -
							verticalContainer.scrollTop -
							verticalContainer.clientHeight <=
						2;
					if (atBottom) {
						isAutoScrolling = false;
						if (nextChapter) {
							goToChapter(nextChapter);
						}
						return;
					}
				}

				if (isAutoScrolling) {
					autoScrollAnimationId = requestAnimationFrame(scrollStep);
				}
			};

			autoScrollAnimationId = requestAnimationFrame(scrollStep);
		} else {
			const intervalMs = preferences.scrollSpeed.secondsPerPage * 1000;
			autoScrollIntervalId = setInterval(() => {
				if (currentPage < pageUrls.length) {
					setPage(currentPage + 1);
				} else if (nextChapter) {
					goToChapter(nextChapter);
				} else {
					isAutoScrolling = false;
				}
			}, intervalMs);
		}

		return () => {
			if (autoScrollAnimationId) {
				cancelAnimationFrame(autoScrollAnimationId);
				autoScrollAnimationId = null;
			}
			if (autoScrollIntervalId) {
				clearInterval(autoScrollIntervalId);
				autoScrollIntervalId = null;
			}
		};
	});

	function toggleAutoScroll() {
		isAutoScrolling = !isAutoScrolling;
		if (isAutoScrolling) {
			resetControlsTimeout();
		}
	}

	function cycleAutoScrollSpeed() {
		const current = preferences.autoScrollSpeedLevel;
		const next = current >= SCROLL_SPEEDS.length ? 1 : current + 1;
		preferences.setAutoScrollSpeedLevel(next);
	}

	function goToChapter(target: Chapter | null) {
		if (!target) return;
		sidebarOpen = false;
		isAutoScrolling = false;
		goto(resolve('/reader/[source]/[id]/[chapter]', { source, id, chapter: target.source_id }));
	}

	function resetControlsTimeout() {
		clearTimeout(controlsTimeout);
		if (isControlsVisible && !sidebarOpen && !isAutoScrolling) {
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
		} else if (e.key === ' ' || e.key === 'Spacebar') {
			e.preventDefault();
			toggleAutoScroll();
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
		if (autoScrollAnimationId) cancelAnimationFrame(autoScrollAnimationId);
		if (autoScrollIntervalId) clearInterval(autoScrollIntervalId);
		if (typeof document !== 'undefined') {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		}
		releaseBackHandler?.();
		releasePages();
	});

	function handleVerticalScroll(e: Event) {
		if (pageUrls.length === 0) return;
		const target = e.target as HTMLElement;
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

	let restoredFor = $state<string | null>(null);

	$effect(() => {
		const container = verticalContainer;
		const total = pageUrls.length;
		const currentChapterId = chapterId;

		if (readingMode !== 'vertical' || !container || total === 0) return;
		if (restoredFor === currentChapterId) return;

		restoredFor = currentChapterId;

		const saved = untrack(() => manga);
		if (saved?.lastChapterId !== currentChapterId) return;
		const targetPage = saved.lastReadPage;
		if (!targetPage || targetPage <= 1) return;

		requestAnimationFrame(() => {
			const slot = container.querySelector<HTMLElement>(`[data-page="${targetPage}"]`);
			slot?.scrollIntoView({ block: 'start' });
		});
	});
</script>

<svelte:window onkeydown={handleKeyDown} onmousemove={handleMouseMove} />

<div class="fixed inset-0 overflow-hidden bg-black font-sans select-none">
	{#if isLoading}
		<div class="flex h-full flex-col items-center justify-center gap-5 text-white">
			<div class="registration border border-[var(--accent)] bg-black p-6">
				<Loader2 class="h-10 w-10 animate-spin text-[var(--accent)]" />
			</div>
			<div class="flex items-center gap-2">
				<span class="hanko text-[0.5rem]">読込中</span>
				<p class="text-xs font-extrabold tracking-[0.2em] text-white/80 uppercase">
					Carregando Páginas
				</p>
			</div>
		</div>
	{:else if error}
		<div class="flex h-full flex-col items-center justify-center p-6 text-center text-white">
			<div class="registration mb-6 border border-[var(--accent)] bg-black p-6 shadow-2xl">
				<AlertCircle class="h-10 w-10 text-[var(--accent)]" />
			</div>
			<span class="hanko mb-2 text-xs">エラー</span>
			<h2 class="masthead mb-2 text-3xl text-white sm:text-4xl">Falha na Leitura</h2>
			<p class="mb-6 max-w-sm text-xs text-white/70">{error}</p>
			<a
				href={resolve('/manga/[source]/[id]', { source, id })}
				class="border border-[var(--accent)] bg-[var(--accent)] px-6 py-2.5 text-xs font-black tracking-wider text-white uppercase shadow-lg"
			>
				Voltar ao Mangá
			</a>
		</div>
	{:else}
		<!-- TOP BAR EDITORIAL -->
		<header
			class={cn(
				'absolute top-0 right-0 left-0 z-50 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 text-white backdrop-blur-md transition-all duration-300 sm:px-6',
				isControlsVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
			)}
		>
			<div class="flex min-w-0 items-center gap-4">
				<a
					href={resolve('/manga/[source]/[id]', { source, id })}
					class="flex h-9 w-9 items-center justify-center border border-white/20 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
					onclick={(e) => e.stopPropagation()}
					title="Voltar ao mangá"
				>
					<ArrowLeft class="h-4 w-4" />
				</a>
				<div class="min-w-0">
					<a
						href={resolve('/manga/[source]/[id]', { source, id })}
						class="block truncate text-xs font-bold text-white transition-colors hover:text-[var(--accent)] sm:text-sm"
						onclick={(e) => e.stopPropagation()}
					>
						{manga?.title ?? 'Leitor'}
						{#if chapterLabel}
							<span class="font-mono text-[var(--accent)]"> — {chapterLabel}</span>
						{/if}
					</a>
					<div
						class="flex items-center gap-2 font-mono text-[0.5625rem] tracking-wider text-white/60 uppercase"
					>
						<span class="tabular font-bold">PÁG. {currentPage} / {pageUrls.length}</span>
						{#if isOfflineSource}
							<span class="stamp text-green-400">OFFLINE</span>
						{/if}
						{#if isAutoScrolling}
							<span class="flex items-center gap-1 font-bold text-[var(--accent)]">
								<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]"
								></span>
								AUTO-SCROLL ({preferences.scrollSpeed.label})
							</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Controles de Auto-Scroll, Zoom e Barra Lateral -->
			<div class="flex items-center gap-1.5 sm:gap-2">
				<!-- Botão de Auto-Scroll / Play-Pause -->
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						toggleAutoScroll();
					}}
					class={cn(
						'flex h-8 items-center gap-1.5 border px-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-colors',
						isAutoScrolling
							? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm'
							: 'border-white/20 text-white hover:border-[var(--accent)] hover:text-[var(--accent)]'
					)}
					title="Ativar/Desativar Rolagem Automática (Espaço)"
				>
					{#if isAutoScrolling}
						<Pause class="h-3.5 w-3.5" />
						<span class="hidden sm:inline">Pausar</span>
					{:else}
						<Play class="h-3.5 w-3.5" />
						<span class="hidden sm:inline">Auto</span>
					{/if}
				</button>

				<!-- Botão de Ciclar Velocidade -->
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						cycleAutoScrollSpeed();
					}}
					class="flex h-8 items-center gap-1 border border-white/20 px-2 font-mono text-[0.625rem] font-bold text-white hover:border-[var(--accent)] hover:text-[var(--accent)]"
					title="Velocidade de rolagem: {preferences.scrollSpeed.label}"
				>
					<FastForward class="h-3 w-3" />
					<span>{preferences.scrollSpeed.level}x</span>
				</button>

				<div class="mx-1 h-4 w-px bg-white/20"></div>

				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						zoomOut();
					}}
					disabled={zoomLevel <= MIN_ZOOM}
					class="flex h-8 w-8 items-center justify-center border border-white/10 hover:border-[var(--accent)] disabled:opacity-30"
					title="Diminuir Zoom (-)"
				>
					<ZoomOut class="h-3.5 w-3.5" />
				</button>
				<span class="w-10 text-center font-mono text-xs font-bold sm:w-12">
					{Math.round(zoomLevel * 100)}%
				</span>
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						zoomIn();
					}}
					disabled={zoomLevel >= MAX_ZOOM}
					class="flex h-8 w-8 items-center justify-center border border-white/10 hover:border-[var(--accent)] disabled:opacity-30"
					title="Aumentar Zoom (+)"
				>
					<ZoomIn class="h-3.5 w-3.5" />
				</button>

				<div class="mx-1 h-4 w-px bg-white/20"></div>

				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						toggleFullscreen();
					}}
					class="hidden h-8 w-8 items-center justify-center border border-white/10 hover:border-[var(--accent)] sm:flex"
					title="Alternar Tela Cheia (F)"
				>
					{#if isFullscreen}
						<Minimize2 class="h-3.5 w-3.5" />
					{:else}
						<Maximize2 class="h-3.5 w-3.5" />
					{/if}
				</button>

				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						sidebarOpen = true;
					}}
					class="flex h-8 w-8 items-center justify-center border border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
					title="Abrir Menu de Capítulos e Configurações"
				>
					<Menu class="h-4 w-4" />
				</button>
			</div>
		</header>

		<!-- ÁREA DO LEITOR -->
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
					class="h-full w-full overflow-x-hidden overflow-y-auto bg-black"
					onscroll={handleVerticalScroll}
				>
					<div class="mx-auto flex w-full flex-col items-center pb-24 md:max-w-[760px]">
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
									class="flex aspect-[2/3] w-full items-center justify-center font-mono text-xs text-[var(--text-muted)]"
								>
									Página {i + 1} indisponível
								</div>
							{/if}
						{/each}

						<!-- Navegação ao Fim do Capítulo -->
						<div class="flex w-full flex-col items-center gap-4 px-6 py-16">
							{#if nextChapter}
								<button
									type="button"
									class="border border-[var(--accent)] bg-[var(--accent)] px-8 py-3 text-xs font-black tracking-wider text-white uppercase shadow-lg transition-all hover:scale-105"
									onclick={() => goToChapter(nextChapter)}
								>
									Próximo Capítulo &bull; {nextChapter.chapter
										? `Cap. ${nextChapter.chapter}`
										: nextChapter.title}
								</button>
							{:else}
								<span class="hanko text-xs">完</span>
								<p class="text-xs font-bold tracking-widest text-white/50 uppercase">
									Você concluiu o último capítulo da obra
								</p>
							{/if}
							<a
								href={resolve('/manga/[source]/[id]', { source, id })}
								class="text-xs font-bold tracking-wider text-white/70 uppercase hover:text-[var(--accent)]"
							>
								Voltar ao Índice de Capítulos
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

		<!-- BARRA INFERIOR DE NAVEGAÇÃO RTL / PAGINADA -->
		{#if readingMode !== 'vertical'}
			<footer
				class={cn(
					'absolute right-0 bottom-0 left-0 z-50 flex items-center justify-between border-t border-white/10 bg-black/90 p-4 px-6 text-white backdrop-blur-md transition-all duration-300',
					isControlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
					sidebarOpen ? 'mr-80' : ''
				)}
			>
				<button
					type="button"
					class="flex h-10 w-10 items-center justify-center border border-white/20 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-20"
					onclick={(e) => {
						e.stopPropagation();
						pageLeft();
					}}
					disabled={readingMode === 'rtl'
						? currentPage >= pageUrls.length && !nextChapter
						: currentPage <= 1 && !prevChapter}
				>
					<ChevronLeft class="h-5 w-5" />
				</button>

				<div class="flex-1 px-6 sm:px-12">
					<input
						type="range"
						min="1"
						max={pageUrls.length}
						value={currentPage}
						oninput={(e) => setPage(Number((e.currentTarget as HTMLInputElement).value))}
						class="w-full cursor-pointer accent-[var(--accent)]"
						onclick={(e) => e.stopPropagation()}
						dir={readingMode === 'rtl' ? 'rtl' : 'ltr'}
					/>
				</div>

				<button
					type="button"
					class="flex h-10 w-10 items-center justify-center border border-white/20 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-20"
					onclick={(e) => {
						e.stopPropagation();
						pageRight();
					}}
					disabled={readingMode === 'rtl'
						? currentPage <= 1 && !prevChapter
						: currentPage >= pageUrls.length && !nextChapter}
				>
					<ChevronRight class="h-5 w-5" />
				</button>
			</footer>
		{/if}

		<!-- DRAWER LATERAL DE CAPÍTULOS & AJUSTES -->
		{#if sidebarOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm"
				onclick={() => (sidebarOpen = false)}
			></div>
		{/if}
		<aside
			class={cn(
				'absolute top-0 right-0 bottom-0 z-50 flex w-80 flex-col border-l border-[var(--rule)] bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-2xl transition-transform duration-300',
				sidebarOpen ? 'translate-x-0' : 'translate-x-full'
			)}
		>
			<div class="flex items-center justify-between border-b border-[var(--rule)] p-3">
				<div class="flex gap-2">
					<button
						type="button"
						class={cn(
							'px-3 py-1.5 text-[0.625rem] font-bold tracking-wider uppercase transition-colors',
							sidebarTab === 'chapters'
								? 'bg-[var(--accent)] text-white'
								: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
						)}
						onclick={() => (sidebarTab = 'chapters')}
					>
						Capítulos
					</button>
					<button
						type="button"
						class={cn(
							'px-3 py-1.5 text-[0.625rem] font-bold tracking-wider uppercase transition-colors',
							sidebarTab === 'settings'
								? 'bg-[var(--accent)] text-white'
								: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
						)}
						onclick={() => (sidebarTab = 'settings')}
					>
						Ajustes
					</button>
				</div>
				<button
					type="button"
					class="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
					onclick={() => (sidebarOpen = false)}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4">
				{#if sidebarTab === 'settings'}
					<span class="kicker mb-3 block text-[0.625rem]">Modo de Leitura</span>
					<div class="flex flex-col gap-2">
						{#each READING_MODES as mode (mode.value)}
							<button
								type="button"
								class={cn(
									'flex items-center justify-between border p-3 text-left text-xs font-bold tracking-wider uppercase transition-all',
									readingMode === mode.value
										? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-md'
										: 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
								)}
								onclick={() => preferences.setReadingMode(mode.value)}
							>
								<span>{mode.label}</span>
								<span class="font-mono text-[0.625rem] opacity-80">{mode.kanji}</span>
							</button>
						{/each}
					</div>

					<span class="kicker mt-6 mb-3 block text-[0.625rem]">Velocidade do Auto-Scroll</span>
					<div class="flex flex-col gap-2">
						{#each SCROLL_SPEEDS as speed (speed.level)}
							<button
								type="button"
								class={cn(
									'flex items-center justify-between border p-2.5 text-left text-xs font-bold tracking-wider uppercase transition-all',
									preferences.autoScrollSpeedLevel === speed.level
										? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-md'
										: 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
								)}
								onclick={() => preferences.setAutoScrollSpeedLevel(speed.level)}
							>
								<span>{speed.label} ({speed.level}x)</span>
								<span class="font-mono text-[0.625rem] opacity-80">
									{readingMode === 'vertical'
										? `${speed.pixelsPerSecond} px/s`
										: `${speed.secondsPerPage} s/pág`}
								</span>
							</button>
						{/each}
					</div>
				{:else if chapters.length === 0}
					<p class="py-8 text-center text-xs text-[var(--text-muted)]">
						Carregando lista de capítulos...
					</p>
				{:else}
					<div class="flex flex-col gap-1">
						{#each chapters as chapter, i (chapter.source_id)}
							<button
								type="button"
								class={cn(
									'flex items-center justify-between border p-2.5 text-left text-xs transition-colors',
									chapter.source_id === chapterId
										? 'border-[var(--accent)] bg-[var(--accent)]/10 font-bold text-[var(--accent)]'
										: 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-primary)]'
								)}
								onclick={() => goToChapter(chapter)}
							>
								<div class="flex min-w-0 items-center gap-2">
									<span class="font-mono text-xs font-black text-[var(--accent)]">
										{String(i + 1).padStart(2, '0')}
									</span>
									<span class="truncate">
										{chapter.chapter ? `Cap. ${chapter.chapter}` : (chapter.title ?? 'Capítulo')}
									</span>
								</div>
								{#if mangaStore.isChapterRead(id, source, chapter.source_id)}
									<span class="font-mono text-[0.5625rem] font-bold text-green-500">LIDO</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Rodapé do Drawer com Navegação Rápida -->
			<div class="flex gap-2 border-t border-[var(--rule)] p-3">
				<button
					type="button"
					class="flex-1 border border-[var(--border)] py-2 font-mono text-[0.625rem] font-bold tracking-wider text-[var(--text-muted)] uppercase hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30"
					onclick={() => goToChapter(prevChapter)}
					disabled={!prevChapter}
				>
					Cap. Anterior
				</button>
				<button
					type="button"
					class="flex-1 border border-[var(--accent)] bg-[var(--accent)] py-2 font-mono text-[0.625rem] font-bold tracking-wider text-white uppercase disabled:opacity-30"
					onclick={() => goToChapter(nextChapter)}
					disabled={!nextChapter}
				>
					Próximo Cap.
				</button>
			</div>
		</aside>
	{/if}
</div>
