<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy, onMount, untrack } from 'svelte';
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
	import { offlineService, StorageFullError } from '$lib/services/offline';
	import {
		ArrowLeft,
		BookOpen,
		Loader2,
		BookmarkPlus,
		BookmarkMinus,
		Download,
		Check,
		RefreshCw,
		AlertTriangle,
		FolderPlus,
		Eye,
		EyeOff,
		Trash2,
		X,
		CheckSquare,
		Square
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

		let active = true;

		// `Promise.allSettled` e nao `all`: o detalhe e a lista de capitulos sao
		// chamadas independentes, e o `all` fazia uma derrubar a outra. Uma obra
		// cujo `/manga/{src}/{id}` falha (capa/sinopse) mas cujos capitulos vem
		// normalmente aparecia como erro total, sem nada para ler — era esse o
		// caso das obras da estante que "nao abriam".
		Promise.allSettled([
			BackendApiService.getDetail(currentSource, mangaId),
			BackendApiService.getChapters(currentSource, mangaId)
		])
			.then(async ([detailRes, chaptersRes]) => {
				if (!active) return;

				if (detailRes.status === 'fulfilled') {
					detail = detailRes.value;
				} else {
					console.warn('Falha ao buscar detalhes da obra', detailRes.reason);
				}

				if (chaptersRes.status === 'fulfilled' && chaptersRes.value.length > 0) {
					chapters = chaptersRes.value;
					void offlineService.cacheChapterList(currentSource, mangaId, chaptersRes.value);
					return;
				}

				// Sem capitulos online: cai para o cache/offline. Se ali tambem nao
				// houver nada, ai sim e erro de verdade.
				const err =
					chaptersRes.status === 'rejected'
						? chaptersRes.reason
						: detailRes.status === 'rejected'
							? detailRes.reason
							: null;
				await fallbackToOffline(currentSource, mangaId, err);
			})
			.catch(async (err) => {
				if (!active) return;
				await fallbackToOffline(currentSource, mangaId, err);
			})
			.finally(() => {
				if (active) {
					isLoading = false;
				}
			});

		async function fallbackToOffline(
			currentSource: string,
			mangaId: string,
			err: unknown
		): Promise<void> {
			if (err) console.warn('Falha ao buscar capítulos online, tentando cache/offline:', err);

			const cached = await offlineService
				.getCachedChapterList(currentSource, mangaId, true)
				.catch(() => undefined);
			if (!active) return;
			if (cached && cached.length > 0) {
				chapters = cached;
				return;
			}

			const allDownloaded = await offlineService.getDownloadedChaptersList().catch(() => []);
			if (!active) return;
			const relevant = allDownloaded
				.filter((c) => c.source === currentSource && c.mangaId === mangaId)
				.map((c) => ({
					source_id: c.chapterId,
					manga_source_id: c.mangaId,
					source: c.source,
					chapter: c.chapter,
					title: c.title,
					volume: undefined
				}));

			if (relevant.length > 0) {
				chapters = relevant;
				return;
			}

			error = err instanceof ApiError ? err.message : 'Falha ao carregar dados do mangá.';
		}
	});

	// ---------------------------------------------------------------------------
	// Colecoes
	// ---------------------------------------------------------------------------

	let isFolderPickerOpen = $state(false);
	let newFolderName = $state('');

	const folders = $derived(mangaStore.folders);
	const mangaFolders = $derived(inLibrary ? mangaStore.foldersOf(id, source) : []);

	/**
	 * Abre o seletor de colecoes. Se a obra ainda nao esta na estante, entra
	 * primeiro: pasta e um rotulo sobre um item da biblioteca, nao ha onde
	 * pendurar a associacao antes disso.
	 */
	function openFolderPicker() {
		if (!inLibrary) {
			if (!displayTitle) return;
			addToLibrary();
		}
		isFolderPickerOpen = true;
	}

	function handleCreateFolder(e: SubmitEvent) {
		e.preventDefault();
		const folder = mangaStore.createFolder(newFolderName);
		if (!folder) return;
		// Criar a pasta daqui significa querer a obra nela — senao seria preciso
		// criar e depois marcar, dois passos para uma intencao so.
		mangaStore.addMangaToFolder(id, source, folder.id);
		newFolderName = '';
	}

	function addToLibrary() {
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

	function toggleLibrary() {
		if (inLibrary) {
			mangaStore.removeManga(id, source);
			isFolderPickerOpen = false;
		} else {
			// Sem titulo ainda seria uma entrada em branco na estante; o botao ja
			// fica desabilitado nesse estado, isso aqui e a rede de seguranca.
			if (!displayTitle) return;
			addToLibrary();
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

		// Cada leitura do banco e assincrona. Sem uma marca de qual obra a
		// pediu, ir para outro manga antes das respostas chegarem faria elas
		// pintarem o estado de download da obra anterior sobre a nova.
		let current = true;
		untrack(() => {
			downloadedMap = {};
			downloadProgress = {};
		});

		for (const chapter of list) {
			offlineService.getChapterStatus(currentSource, mangaId, chapter.source_id).then((meta) => {
				if (!current) return;
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

		return () => {
			current = false;
		};
	});

	// ---------------------------------------------------------------------------
	// Selecao de capitulos
	// ---------------------------------------------------------------------------

	let selectionMode = $state(false);
	let selectedIds = $state<string[]>([]);

	const selectedCount = $derived(selectedIds.length);
	const allSelected = $derived(chapters.length > 0 && selectedCount === chapters.length);

	function toggleSelectionMode() {
		selectionMode = !selectionMode;
		if (!selectionMode) selectedIds = [];
	}

	function toggleSelected(chapterId: string) {
		selectedIds = selectedIds.includes(chapterId)
			? selectedIds.filter((c) => c !== chapterId)
			: [...selectedIds, chapterId];
	}

	function toggleSelectAll() {
		selectedIds = allSelected ? [] : chapters.map((c) => c.source_id);
	}

	function markSelected(read: boolean) {
		if (!inLibrary || selectedCount === 0) return;
		// Uma escrita so no localStorage, em vez de uma por capitulo.
		mangaStore.setChaptersRead(id, source, selectedIds, read);
		selectedIds = [];
	}

	/**
	 * Baixa os selecionados em fila, um capitulo por vez.
	 *
	 * Sequencial de proposito: cada `downloadChapter` ja abre 4 conexoes em
	 * paralelo internamente. Disparar 20 capitulos juntos seriam 80 requisicoes
	 * simultaneas na mesma scan — caminho curto para tomar 429 ou bloqueio.
	 */
	async function downloadSelected() {
		if (selectedCount === 0 || isBatchRunning) return;

		const targets = chapters.filter((c) => selectedIds.includes(c.source_id));
		isBatchRunning = true;
		batchCancelled = false;
		batchDone = 0;
		batchTotal = targets.length;
		downloadError = null;

		let failures = 0;
		let ranOutOfSpace = false;
		for (const chapter of targets) {
			if (batchCancelled) break;
			if (downloadedMap[chapter.source_id] === 'downloaded') {
				batchDone++;
				continue;
			}
			try {
				await runDownload(chapter);
			} catch (err) {
				// Disco cheio nao melhora no proximo capitulo: insistir so
				// gastaria banda para falhar 19 vezes seguidas.
				if (err instanceof StorageFullError) {
					ranOutOfSpace = true;
					break;
				}
				if (!batchCancelled) failures++;
			}
			batchDone++;
		}

		isBatchRunning = false;
		if (ranOutOfSpace) {
			downloadError = new StorageFullError().message;
		} else if (batchCancelled) {
			downloadError = `Fila interrompida. ${batchDone} de ${batchTotal} capítulos processados.`;
		} else if (failures > 0) {
			downloadError = `${failures} de ${batchTotal} capítulos falharam. Selecione e tente de novo.`;
		}
		selectedIds = [];
	}

	let isBatchRunning = $state(false);
	let batchCancelled = $state(false);
	let batchDone = $state(0);
	let batchTotal = $state(0);

	/**
	 * Para a fila e o capitulo em curso.
	 *
	 * Marcar a flag sozinha so evita o *proximo* capitulo: o atual seguiria
	 * baixando ate a ultima pagina, o que num capitulo longo e quase um minuto
	 * ignorando o "cancelar" que o usuario acabou de tocar.
	 */
	function cancelBatch() {
		batchCancelled = true;
		downloadController?.abort();
	}

	/**
	 * Cancela o que estiver baixando. Trocado por um novo a cada download, e
	 * abortado ao sair da pagina — sem isto, sair no meio de uma fila deixava o
	 * capitulo atual baixando suas ~200 paginas contra uma tela que nao existe
	 * mais, gravando estado em componentes ja destruidos.
	 */
	let downloadController: AbortController | null = null;

	onDestroy(() => {
		batchCancelled = true;
		downloadController?.abort();
	});

	/** O miolo do download, compartilhado pelo botao individual e pela fila. */
	async function runDownload(chapter: Chapter) {
		const cid = chapter.source_id;
		downloadedMap[cid] = 'downloading';
		downloadProgress[cid] = 0;

		const controller = new AbortController();
		downloadController = controller;

		try {
			const status = await offlineService.downloadChapter(
				source,
				id,
				cid,
				{ title: chapter.title, chapter: chapter.chapter, mangaTitle: displayTitle },
				(progress) => {
					downloadProgress[cid] = progress;
				},
				controller.signal
			);
			downloadedMap[cid] = status === 'partial' ? 'partial' : 'downloaded';
			return status;
		} catch (err) {
			// Um cancelamento pode ter salvo paginas antes de parar: consulta o
			// banco em vez de assumir que nada foi baixado.
			const meta = await offlineService.getChapterStatus(source, id, cid);
			downloadedMap[cid] = !meta
				? 'not_downloaded'
				: meta.status === 'partial'
					? 'partial'
					: 'downloaded';
			if (meta?.status === 'partial' && meta.totalPages > 0) {
				downloadProgress[cid] = Math.round((meta.pageCount / meta.totalPages) * 100);
			}
			throw err;
		} finally {
			if (downloadController === controller) downloadController = null;
		}
	}

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

		downloadError = null;
		try {
			const status = await runDownload(chapter);
			if (status === 'partial') {
				downloadError = 'Algumas páginas falharam. Toque em baixar de novo para completar.';
			}
		} catch (err) {
			// Sair da pagina aborta o download; nao e erro que valha alarme.
			if (err instanceof DOMException && err.name === 'AbortError') return;
			console.error('Falha ao baixar capítulo', err);
			downloadError =
				err instanceof StorageFullError || err instanceof ApiError
					? err.message
					: 'Erro ao baixar o capítulo. Tente novamente.';
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

					<button
						type="button"
						onclick={openFolderPicker}
						disabled={isTitlePending}
						class="flex items-center gap-2 border border-[var(--rule)] bg-[var(--bg-primary)] px-5 py-2.5 text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						<FolderPlus class="h-4 w-4" />
						<span>
							{#if mangaFolders.length > 0}
								{mangaFolders.length} coleç{mangaFolders.length === 1 ? 'ão' : 'ões'}
							{:else}
								Coleções
							{/if}
						</span>
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

				<!-- Coleções às quais a obra pertence -->
				{#if mangaFolders.length > 0}
					<div class="mt-4 flex flex-wrap items-center gap-1.5">
						<span
							class="font-mono text-[0.5625rem] tracking-wider text-[var(--text-muted)] uppercase"
							>Em:</span
						>
						{#each mangaFolders as folder (folder.id)}
							<span
								class="border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[0.5625rem] font-bold tracking-wider text-[var(--accent)] uppercase"
							>
								{folder.name}
							</span>
						{/each}
					</div>
				{/if}
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
			<div class="flex items-center gap-3">
				<span class="font-mono text-[0.625rem] text-[var(--text-muted)]"
					>{chapters.length} FASCÍCULOS</span
				>
				{#if chapters.length > 0}
					<button
						type="button"
						onclick={toggleSelectionMode}
						class="border border-[var(--rule)] px-2.5 py-1 text-[0.5625rem] font-bold tracking-wider text-[var(--text-muted)] uppercase transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
					>
						{selectionMode ? 'Cancelar' : 'Selecionar'}
					</button>
				{/if}
			</div>
		</div>

		<!-- Barra de Ações em Lote -->
		{#if selectionMode}
			<div
				class="registration mb-4 flex flex-wrap items-center gap-2 border border-[var(--accent)]/50 bg-[var(--bg-secondary)] p-3"
			>
				<button
					type="button"
					onclick={toggleSelectAll}
					class="flex min-h-11 items-center gap-1.5 border border-[var(--rule)] px-3 py-1.5 text-[0.625rem] font-bold tracking-wider text-[var(--text-primary)] uppercase transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
				>
					{#if allSelected}
						<CheckSquare class="h-3.5 w-3.5 text-[var(--accent)]" />
						<span>Limpar</span>
					{:else}
						<Square class="h-3.5 w-3.5" />
						<span>Todos</span>
					{/if}
				</button>

				<span class="font-mono text-[0.625rem] font-bold text-[var(--accent)]">
					{selectedCount} selecionado{selectedCount === 1 ? '' : 's'}
				</span>

				<div class="ml-auto flex flex-wrap items-center gap-2">
					<button
						type="button"
						onclick={downloadSelected}
						disabled={selectedCount === 0 || isBatchRunning}
						class="flex min-h-11 items-center gap-1.5 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[0.625rem] font-black tracking-wider text-white uppercase transition-all disabled:cursor-not-allowed disabled:opacity-30"
					>
						<Download class="h-3.5 w-3.5" />
						<span>Baixar</span>
					</button>
					<!-- Marcar como lido so faz sentido para obra na estante: e la que
					     o progresso mora. -->
					<button
						type="button"
						onclick={() => markSelected(true)}
						disabled={selectedCount === 0 || !inLibrary}
						title={inLibrary ? 'Marcar selecionados como lidos' : 'Adicione à estante primeiro'}
						class="flex min-h-11 items-center gap-1.5 border border-[var(--rule)] px-3 py-1.5 text-[0.625rem] font-bold tracking-wider text-[var(--text-primary)] uppercase transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30"
					>
						<Eye class="h-3.5 w-3.5" />
						<span>Lido</span>
					</button>
					<button
						type="button"
						onclick={() => markSelected(false)}
						disabled={selectedCount === 0 || !inLibrary}
						title={inLibrary ? 'Desmarcar selecionados' : 'Adicione à estante primeiro'}
						class="flex min-h-11 items-center gap-1.5 border border-[var(--rule)] px-3 py-1.5 text-[0.625rem] font-bold tracking-wider text-[var(--text-primary)] uppercase transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30"
					>
						<EyeOff class="h-3.5 w-3.5" />
						<span>Não lido</span>
					</button>
				</div>

				{#if isBatchRunning}
					<div class="flex w-full items-center gap-3 border-t border-[var(--rule)] pt-2">
						<RefreshCw class="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
						<span class="font-mono text-[0.625rem] text-[var(--text-secondary)]">
							Baixando {batchDone + 1} de {batchTotal}...
						</span>
						<button
							type="button"
							onclick={cancelBatch}
							class="ml-auto flex items-center gap-1 text-[0.625rem] font-bold tracking-wider text-[var(--text-muted)] uppercase hover:text-[var(--accent)]"
						>
							<X class="h-3 w-3" />
							<span>Parar</span>
						</button>
					</div>
				{/if}
			</div>
		{/if}

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
			<!--
				Numero + titulo do capitulo. Vive num snippet porque o mesmo conteudo
				aparece dentro de um <a> (navega) e de um <button> (seleciona), e um
				nao pode ser aninhado no outro.
			-->
			{#snippet chapterLabel(chapter: Chapter, i: number, isRead: boolean)}
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
						class={cn(
							'truncate text-xs font-bold transition-colors group-hover:text-[var(--accent)]',
							isRead ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'
						)}
					>
						{chapter.chapter
							? `Capítulo ${chapter.chapter}`
							: chapter.title || 'Capítulo sem título'}
					</h3>
					{#if chapter.title && chapter.chapter}
						<p class="truncate text-[0.625rem] text-[var(--text-muted)]">{chapter.title}</p>
					{/if}
				</div>
				{#if isRead}
					<Eye class="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
				{/if}
			{/snippet}

			<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
				{#each chapters as chapter, i (chapter.source_id)}
					{@const isRead = mangaStore.isChapterRead(id, source, chapter.source_id)}
					{@const isSelected = selectedIds.includes(chapter.source_id)}
					<div
						class={cn(
							'group flex items-stretch border bg-[var(--bg-secondary)] transition-all hover:border-[var(--accent)] hover:shadow-md',
							isSelected
								? 'border-[var(--accent)]'
								: isRead
									? 'border-[var(--accent)]/40'
									: 'border-[var(--rule)]',
							// O capitulo lido fica apagado — a lista inteira parecia igual e
							// nao dava para saber de onde continuar so olhando.
							isRead && !isSelected && 'opacity-55 hover:opacity-100'
						)}
					>
						{#if selectionMode}
							<!-- Em modo selecao o card nao navega: o toque marca/desmarca. -->
							<button
								type="button"
								onclick={() => toggleSelected(chapter.source_id)}
								class="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left"
							>
								{#if isSelected}
									<CheckSquare class="h-4 w-4 shrink-0 text-[var(--accent)]" />
								{:else}
									<Square class="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
								{/if}
								{@render chapterLabel(chapter, i, isRead)}
							</button>
						{:else}
							<a
								href={resolve('/reader/[source]/[id]/[chapter]', {
									source,
									id,
									chapter: chapter.source_id
								})}
								class="flex min-w-0 flex-1 items-center gap-3 p-3.5"
							>
								{@render chapterLabel(chapter, i, isRead)}
							</a>
						{/if}

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
								class="flex min-w-14 flex-col items-center justify-center gap-0.5 border-l border-[var(--rule)] px-3 text-[0.5rem] font-bold text-[var(--accent)] tabular-nums"
							>
								<RefreshCw class="h-4 w-4 animate-spin" />
								<!-- O numero e o que separa "travou" de "esta indo". -->
								<span>{downloadProgress[chapter.source_id] ?? 0}%</span>
							</div>
						{:else if downloadedMap[chapter.source_id] === 'partial'}
							<button
								type="button"
								onclick={(e) => handleDownload(chapter, e)}
								class="flex min-w-14 flex-col items-center justify-center gap-0.5 border-l border-[var(--rule)] px-3 text-[0.5rem] font-bold text-amber-500 tabular-nums transition-colors hover:text-[var(--accent)]"
								title="Download incompleto. Toque para baixar as páginas que faltam."
							>
								<AlertTriangle class="h-4 w-4" />
								<span>{downloadProgress[chapter.source_id] ?? 0}%</span>
							</button>
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

<!-- Seletor de Coleções -->
{#if isFolderPickerOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<!-- Fundo clicavel: fechar tocando fora e o gesto esperado num modal. -->
		<button
			type="button"
			aria-label="Fechar seletor de coleções"
			onclick={() => (isFolderPickerOpen = false)}
			class="absolute inset-0 bg-black/70 backdrop-blur-sm"
		></button>

		<!--
			`dvh` e nao `vh`: com o teclado virtual aberto para digitar o nome da
			colecao, `vh` continua medindo a tela inteira e o campo some atras do
			teclado. A safe-area impede que o sheet encoste na barra de gestos.
		-->
		<div
			class="relative flex max-h-[80dvh] w-full max-w-md flex-col border border-[var(--rule)] bg-[var(--bg-primary)] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:pb-0"
		>
			<div class="flex items-center justify-between border-b border-[var(--rule)] p-4">
				<h2 class="text-sm font-black tracking-wider text-[var(--text-primary)] uppercase">
					Coleções
				</h2>
				<button
					type="button"
					onclick={() => (isFolderPickerOpen = false)}
					aria-label="Fechar"
					class="-mr-2 flex h-11 w-11 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-4">
				{#if folders.length === 0}
					<p class="py-6 text-center text-xs text-[var(--text-muted)]">
						Nenhuma coleção ainda. Crie a primeira abaixo.
					</p>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each folders as folder (folder.id)}
							{@const checked = mangaStore.isMangaInFolder(id, source, folder.id)}
							<li class="flex items-stretch">
								<button
									type="button"
									onclick={() => mangaStore.toggleMangaFolder(id, source, folder.id)}
									class={cn(
										'flex flex-1 items-center gap-3 border p-3 text-left transition-colors',
										checked
											? 'border-[var(--accent)] bg-[var(--accent)]/10'
											: 'border-[var(--rule)] hover:border-[var(--accent)]'
									)}
								>
									{#if checked}
										<CheckSquare class="h-4 w-4 shrink-0 text-[var(--accent)]" />
									{:else}
										<Square class="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
									{/if}
									<span
										class="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text-primary)]"
									>
										{folder.name}
									</span>
									<span class="font-mono text-[0.625rem] text-[var(--text-muted)]">
										{mangaStore.folderCount(folder.id)}
									</span>
								</button>
								<button
									type="button"
									onclick={() => mangaStore.deleteFolder(folder.id)}
									title="Excluir coleção (as obras continuam na estante)"
									aria-label="Excluir coleção {folder.name}"
									class="flex items-center justify-center border-y border-r border-[var(--rule)] px-3 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<form
				onsubmit={handleCreateFolder}
				class="flex gap-2 border-t border-[var(--rule)] bg-[var(--bg-secondary)] p-4"
			>
				<input
					bind:value={newFolderName}
					type="text"
					maxlength="40"
					placeholder="Nova coleção..."
					class="min-w-0 flex-1 border border-[var(--rule)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
				/>
				<button
					type="submit"
					disabled={newFolderName.trim().length === 0}
					class="flex items-center gap-1.5 border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-[0.625rem] font-black tracking-wider text-white uppercase transition-all disabled:cursor-not-allowed disabled:opacity-30"
				>
					<FolderPlus class="h-3.5 w-3.5" />
					<span>Criar</span>
				</button>
			</form>
		</div>
	</div>
{/if}
