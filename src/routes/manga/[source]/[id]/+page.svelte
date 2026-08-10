<script lang="ts">
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import { recallPreview } from '$lib/stores/preview';
	import { cn } from '$lib/utils';
	import {
		ApiError,
		BackendApiService,
		resolveImageUrl,
		type Chapter,
		type GenreInfo,
		type MangaSearchResult
	} from '$lib/services/api';
	import { offlineService } from '$lib/services/offline';
	import {
		ArrowLeft,
		BookOpen,
		Loader2,
		BookmarkPlus,
		BookmarkMinus,
		Download,
		Check,
		RefreshCw,
		AlertTriangle
	} from 'lucide-svelte';

	const source = $derived(page.params.source ?? '');
	const id = $derived(page.params.id ?? '');

	// Checa se o mangá já está adicionado à estante do usuário
	const libraryManga = $derived(mangaStore.find(id, source));
	const inLibrary = $derived(!!libraryManga);

	let detail = $state<MangaSearchResult | null>(null);
	let chapters = $state<Chapter[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	/**
	 * Titulo e capa que a lista de origem ja mostrava. Sem isso a tela abria com
	 * o texto "Manga" e um quadro vazio ate a requisicao voltar — a obra vinda do
	 * catalogo nao esta na biblioteca, entao nao havia fallback nenhum.
	 */
	const preview = $derived(recallPreview(source, id));

	// Preferimos o backend; ate ele responder valem a biblioteca local e o
	// preview do card clicado, nessa ordem.
	const displayTitle = $derived(detail?.title || libraryManga?.title || preview?.title || '');
	const displayCover = $derived(
		resolveImageUrl(detail?.cover_url) ||
			resolveImageUrl(libraryManga?.coverUrl) ||
			preview?.coverUrl
	);
	const displayDescription = $derived(detail?.description ?? libraryManga?.description);

	/**
	 * So o masthead: enquanto nao houver titulo nenhum para mostrar, a barra de
	 * titulo vira esqueleto em vez de exibir um nome inventado.
	 */
	const isTitlePending = $derived(!displayTitle);

	let genreLabels = $state<Record<string, string>>({});
	const displayGenres = $derived(detail?.genres ?? libraryManga?.genres ?? []);

	onMount(() => {
		BackendApiService.getGenres()
			.then((list: GenreInfo[]) => {
				genreLabels = Object.fromEntries(list.map((g) => [g.slug, g.label]));
			})
			.catch((err) => console.error('Falha ao carregar rótulos de gênero', err));
	});

	// Capítulo por onde retomar a leitura
	const resumeChapter = $derived(
		chapters.find((c) => c.source_id === libraryManga?.lastChapterId) ?? chapters[0]
	);

	$effect(() => {
		const currentSource = source;
		const mangaId = id;
		if (!currentSource || !mangaId) return;

		isLoading = true;
		error = null;

		Promise.all([
			BackendApiService.getDetail(currentSource, mangaId),
			BackendApiService.getChapters(currentSource, mangaId)
		])
			.then(([detailRes, chaptersRes]) => {
				detail = detailRes;
				chapters = chaptersRes;
			})
			.catch((err) => {
				console.error(err);
				error = err instanceof ApiError ? err.message : 'Falha ao carregar dados do mangá.';
			})
			.finally(() => {
				isLoading = false;
			});
	});

	function toggleLibrary() {
		if (inLibrary) {
			mangaStore.removeManga(id, source);
		} else {
			// Sem titulo ainda seria uma entrada em branco na estante; o botao ja
			// fica desabilitado nesse estado, isso aqui e a rede de seguranca.
			if (!displayTitle) return;
			const newManga: Manga = {
				id,
				source,
				title: displayTitle,
				coverUrl: displayCover,
				description: displayDescription,
				genres: displayGenres,
				progress: 0,
				lastReadPage: 0,
				totalPage: 0,
				addedAt: new Date().toISOString()
			};
			mangaStore.addManga(newManga);
		}
	}

	// Gerenciamento de download offline dos capítulos
	type DownloadState = 'downloaded' | 'downloading' | 'partial' | 'not_downloaded';
	let downloadedMap = $state<Record<string, DownloadState>>({});
	let downloadProgress = $state<Record<string, number>>({});
	let downloadError = $state<string | null>(null);

	$effect(() => {
		const currentSource = source;
		const mangaId = id;
		const list = chapters;

		for (const chapter of list) {
			offlineService.getChapterStatus(currentSource, mangaId, chapter.source_id).then((meta) => {
				untrack(() => {
					if (downloadedMap[chapter.source_id] === 'downloading') return;
					downloadedMap[chapter.source_id] = !meta
						? 'not_downloaded'
						: meta.status === 'partial'
							? 'partial'
							: 'downloaded';
					if (meta?.status === 'partial' && meta.totalPages > 0) {
						downloadProgress[chapter.source_id] = Math.round(
							(meta.pageCount / meta.totalPages) * 100
						);
					}
				});
			});
		}
	});

	async function handleDownload(chapter: Chapter, e: Event) {
		e.stopPropagation();
		e.preventDefault();
		const cid = chapter.source_id;

		if (downloadedMap[cid] === 'downloaded') {
			try {
				await offlineService.deleteChapter(source, id, cid);
				downloadedMap[cid] = 'not_downloaded';
			} catch (err) {
				console.error('Falha ao remover capítulo', err);
				downloadError = 'Não foi possível remover o capítulo.';
			}
			return;
		}

		if (downloadedMap[cid] === 'downloading') return;

		downloadedMap[cid] = 'downloading';
		downloadProgress[cid] = 0;
		downloadError = null;
		try {
			const status = await offlineService.downloadChapter(
				source,
				id,
				cid,
				{ title: chapter.title, chapter: chapter.chapter, mangaTitle: displayTitle },
				(progress) => {
					downloadProgress[cid] = progress;
				}
			);
			downloadedMap[cid] = status === 'partial' ? 'partial' : 'downloaded';
			if (status === 'partial') {
				downloadError = 'Algumas páginas falharam. Toque em baixar de novo para completar.';
			}
		} catch (err) {
			console.error('Falha ao baixar capítulo', err);
			downloadedMap[cid] = 'not_downloaded';
			downloadError =
				err instanceof ApiError ? err.message : 'Erro ao baixar o capítulo. Tente novamente.';
		}
	}
</script>

<svelte:head>
	<title>{displayTitle ? `${displayTitle} • Hiraku` : 'Hiraku'}</title>
</svelte:head>

<main class="min-h-screen px-4 pt-6 pb-28 text-[var(--text-primary)] sm:px-8 xl:px-14">
	<!-- Link de Retorno ao Catálogo / Estante -->
	<div class="mb-6 flex items-center justify-between">
		<a
			href={resolve('/catalog')}
			class="inline-flex items-center gap-2 text-[0.625rem] font-black tracking-[0.2em] text-[var(--text-muted)] uppercase transition-colors hover:text-[var(--accent)]"
		>
			<ArrowLeft class="h-3.5 w-3.5" />
			<span>Voltar ao Catálogo</span>
		</a>

		<div class="flex items-center gap-2">
			<span class="hanko text-[0.5rem]">{source.toUpperCase()}</span>
			<span class="tategaki text-xs font-bold text-[var(--accent)]">単行本</span>
		</div>
	</div>

	<!--
		Masthead da Obra
	-->
	<header
		class="registration relative mb-12 overflow-hidden border border-[var(--rule)] bg-[var(--bg-secondary)] p-6 shadow-2xl sm:p-8"
	>
		{#if displayCover}
			<div
				class="pointer-events-none absolute -top-20 -right-20 h-96 w-96 rounded-full bg-cover bg-center opacity-10 blur-3xl"
				style="background-image: url({displayCover})"
			></div>
		{/if}

		<div class="relative z-10 flex flex-col gap-8 md:flex-row md:items-end">
			<!-- Volume Físico com Aspecto 2:3 e Lombada -->
			<div
				class="volume registration aspect-[2/3] w-40 flex-shrink-0 overflow-hidden border border-[var(--rule)] bg-[var(--bg-primary)] shadow-2xl sm:w-52"
			>
				{#if displayCover}
					<img src={displayCover} alt="Capa de {displayTitle}" class="h-full w-full object-cover" />
				{:else if isLoading}
					<!-- Sem capa e sem dado ainda: pulsa em vez de fingir uma capa vazia. -->
					<div class="h-full w-full animate-pulse bg-[var(--bg-accent)]"></div>
				{:else}
					<div class="halftone flex h-full w-full flex-col justify-between p-4">
						<span class="hanko text-[0.5rem]">{source.toUpperCase()}</span>
						<h3 class="masthead text-lg text-[var(--text-primary)]">{displayTitle}</h3>
						<span class="font-mono text-[0.5625rem] text-[var(--text-muted)]">HIRAKU ED.</span>
					</div>
				{/if}
			</div>

			<!-- Informações Editoriais da Obra -->
			<div class="flex-1">
				<div class="mb-3 flex flex-wrap items-center gap-2">
					<span class="hanko text-[0.5625rem]">公式</span>
					{#if chapters.length > 0}
						<span class="kicker text-[0.625rem]">
							{chapters.length} capítulo{chapters.length !== 1 ? 's' : ''} indexados
						</span>
					{/if}
				</div>

				{#if isTitlePending}
					<div class="h-9 w-3/4 animate-pulse bg-[var(--bg-accent)] sm:h-12"></div>
				{:else}
					<h1 class="masthead text-3xl text-[var(--text-primary)] sm:text-5xl">
						{displayTitle}
					</h1>
				{/if}

				<!-- Chips de Gênero -->
				{#if displayGenres.length > 0}
					<div class="mt-4 flex flex-wrap gap-1.5">
						{#each displayGenres as slug (slug)}
							<span
								class="border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[0.5625rem] font-bold tracking-wider text-[var(--text-muted)] uppercase"
							>
								{genreLabels[slug] ?? slug}
							</span>
						{/each}
					</div>
				{/if}

				<!-- Botões de Ação Imediata -->
				<div class="mt-6 flex flex-wrap items-center gap-3">
					<button
						type="button"
						onclick={toggleLibrary}
						disabled={isTitlePending}
						class="flex items-center gap-2 border border-[var(--rule)] bg-[var(--bg-primary)] px-5 py-2.5 text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if inLibrary}
							<BookmarkMinus class="h-4 w-4 text-[var(--accent)]" />
							<span>Na Estante</span>
						{:else}
							<BookmarkPlus class="h-4 w-4" />
							<span>Adicionar à Estante</span>
						{/if}
					</button>

					{#if resumeChapter}
						<a
							href={resolve('/reader/[source]/[id]/[chapter]', {
								source,
								id,
								chapter: resumeChapter.source_id
							})}
							class="flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-6 py-2.5 text-xs font-black tracking-wider text-white uppercase shadow-[0_0_15px_var(--accent-glow)] transition-all hover:scale-105 active:scale-95"
						>
							<BookOpen class="h-4 w-4" />
							<span>
								{#if libraryManga?.lastChapterId === resumeChapter.source_id}
									Continuar Leitura
								{:else}
									Começar do Cap. 1
								{/if}
							</span>
						</a>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<!-- Sinopse com Moldura Manga-Panel -->
	{#if displayDescription}
		<section
			class="manga-panel registration mb-12 border border-[var(--rule)] bg-[var(--bg-secondary)] p-6"
		>
			<div class="mb-3 flex items-center justify-between">
				<span class="kicker text-[0.6875rem]">Sinopse &bull; Resumo da Obra</span>
				<span class="font-mono text-[0.625rem] text-[var(--text-muted)]">概要</span>
			</div>
			<p class="text-xs leading-relaxed font-medium text-[var(--text-secondary)] sm:text-sm">
				{displayDescription}
			</p>
		</section>
	{/if}

	<!-- Lista de Capítulos com Marcadores Offline -->
	<section>
		<div class="mb-6 flex items-center justify-between border-b border-[var(--rule)] pb-3">
			<div class="flex items-center gap-3">
				<span class="h-2 w-2 bg-[var(--accent)]"></span>
				<h2
					class="text-xs font-extrabold tracking-[0.2em] text-[var(--text-primary)] uppercase sm:text-sm"
				>
					Índice de Capítulos
				</h2>
			</div>
			<span class="font-mono text-[0.625rem] text-[var(--text-muted)]"
				>{chapters.length} FASCÍCULOS</span
			>
		</div>

		{#if isLoading}
			<div class="flex flex-col items-center justify-center py-20">
				<Loader2 class="h-8 w-8 animate-spin text-[var(--accent)]" />
				<span class="mt-3 text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
					Carregando Capítulos...
				</span>
			</div>
		{:else if error}
			<div class="border border-[var(--accent)] bg-[var(--accent)]/10 p-6 text-center">
				<AlertTriangle class="mx-auto h-6 w-6 text-[var(--accent)]" />
				<p class="mt-2 text-xs font-bold text-[var(--text-primary)]">{error}</p>
			</div>
		{:else if chapters.length === 0}
			<div class="border border-dashed border-[var(--border)] p-12 text-center">
				<p class="text-xs text-[var(--text-secondary)]">
					Nenhum capítulo disponível para esta obra.
				</p>
			</div>
		{:else}
			{#if downloadError}
				<div
					class="mb-4 flex items-start gap-2 border border-[var(--accent)] bg-[var(--accent)]/10 p-3"
				>
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
					<p class="text-xs text-[var(--text-primary)]">{downloadError}</p>
				</div>
			{/if}
			<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
				{#each chapters as chapter, i (chapter.source_id)}
					{@const isRead = mangaStore.isChapterRead(id, source, chapter.source_id)}
					<div
						class={cn(
							'group flex items-stretch border bg-[var(--bg-secondary)] transition-all hover:border-[var(--accent)] hover:shadow-md',
							isRead ? 'border-[var(--accent)]/40' : 'border-[var(--rule)]'
						)}
					>
						<a
							href={resolve('/reader/[source]/[id]/[chapter]', {
								source,
								id,
								chapter: chapter.source_id
							})}
							class="flex min-w-0 flex-1 items-center gap-3 p-3.5"
						>
							<span
								class={cn(
									'font-mono text-lg font-black',
									isRead ? 'text-[var(--text-muted)]' : 'text-[var(--accent)]'
								)}
							>
								{String(i + 1).padStart(2, '0')}
							</span>
							<div class="min-w-0 flex-1">
								<h3
									class="truncate text-xs font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]"
								>
									{chapter.chapter
										? `Capítulo ${chapter.chapter}`
										: chapter.title || 'Capítulo sem título'}
								</h3>
								{#if chapter.title && chapter.chapter}
									<p class="truncate text-[0.625rem] text-[var(--text-muted)]">{chapter.title}</p>
								{/if}
							</div>
						</a>

						<!-- Ação de Download Offline -->
						{#if downloadedMap[chapter.source_id] === 'downloaded'}
							<button
								type="button"
								onclick={(e) => handleDownload(chapter, e)}
								class="flex items-center justify-center border-l border-[var(--rule)] px-4 text-green-500 transition-colors hover:text-[var(--accent)]"
								title="Capítulo disponível offline. Clique para remover."
							>
								<Check class="h-4 w-4" />
							</button>
						{:else if downloadedMap[chapter.source_id] === 'downloading'}
							<div
								class="flex items-center justify-center border-l border-[var(--rule)] px-4 text-xs font-bold text-[var(--accent)]"
							>
								<RefreshCw class="h-4 w-4 animate-spin" />
							</div>
						{:else}
							<button
								type="button"
								onclick={(e) => handleDownload(chapter, e)}
								class="flex items-center justify-center border-l border-[var(--rule)] px-4 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
								title="Baixar para leitura offline"
							>
								<Download class="h-4 w-4" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</main>
