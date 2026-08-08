<script lang="ts">
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
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

	// Check if this manga is already in the library
	const libraryManga = $derived(mangaStore.find(id, source));
	const inLibrary = $derived(!!libraryManga);

	let detail = $state<MangaSearchResult | null>(null);
	let chapters = $state<Chapter[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Resolved display info: prefer backend detail, fallback to library
	const displayTitle = $derived(detail?.title || libraryManga?.title || 'Manga');
	const displayCover = $derived(resolveImageUrl(detail?.cover_url) || libraryManga?.coverUrl);
	const displayDescription = $derived(detail?.description ?? libraryManga?.description);

	// Generos vem como slug canonic; o rotulo em portugues vem de /genres.
	let genreLabels = $state<Record<string, string>>({});
	const displayGenres = $derived(detail?.genres ?? libraryManga?.genres ?? []);

	onMount(() => {
		BackendApiService.getGenres()
			.then((list: GenreInfo[]) => {
				genreLabels = Object.fromEntries(list.map((g) => [g.slug, g.label]));
			})
			// Filtro de genero e enfeite: sem os rotulos mostramos o slug.
			.catch((err) => console.error('Falha ao carregar rótulos de gênero', err));
	});

	// Capitulo por onde retomar a leitura.
	const resumeChapter = $derived(
		chapters.find((c) => c.source_id === libraryManga?.lastChapterId) ?? chapters[0]
	);

	// Fetch detail + chapters on mount
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
			const newManga: Manga = {
				id,
				source,
				title: displayTitle,
				coverUrl: displayCover,
				description: displayDescription,
				// Guardados junto: a biblioteca funciona offline e nao pode depender
				// de uma nova chamada de detalhe para filtrar por genero.
				genres: displayGenres,
				progress: 0,
				lastReadPage: 0,
				totalPage: 0,
				addedAt: new Date().toISOString()
			};
			mangaStore.addManga(newManga);
		}
	}

	// Download state management
	type DownloadState = 'downloaded' | 'downloading' | 'partial' | 'not_downloaded';
	let downloadedMap = $state<Record<string, DownloadState>>({});
	let downloadProgress = $state<Record<string, number>>({});
	let downloadError = $state<string | null>(null);

	// Status offline dos capitulos, recarregado quando a lista muda.
	//
	// O corpo escreve em `downloadedMap`/`downloadProgress`, entao a leitura
	// desses mapas vai dentro de `untrack`: rastreada, cada escrita re-disparava
	// o effect, que relia o IndexedDB e sobrescrevia o progresso de um download
	// em andamento — era o que travava a barra no primeiro capitulo.
	$effect(() => {
		const currentSource = source;
		const mangaId = id;
		const list = chapters;

		for (const chapter of list) {
			offlineService.getChapterStatus(currentSource, mangaId, chapter.source_id).then((meta) => {
				untrack(() => {
					// Não sobrescreve um download em andamento.
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

		// Parcial tambem entra: baixar de novo retoma as paginas que faltam.
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

<main class="pb-28 text-[var(--text-primary)] xl:pb-14">
	<!-- Capa como pano de fundo: mesma referencia de "arte encoberta pela lombada" do volume. -->
	<div class="halftone relative overflow-hidden border-b border-[var(--border)]">
		{#if displayCover}
			<div
				class="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-2xl"
				style="background-image: url({displayCover})"
			></div>
		{/if}
		<div
			class="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/85 to-[var(--bg-primary)]/40"
		></div>

		<div class="relative mx-auto max-w-6xl px-6 pt-8 pb-10 md:px-10 md:pt-10">
			<a
				href={resolve('/catalog')}
				class="mb-8 inline-flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.18em] text-[var(--text-muted)] uppercase transition-colors hover:text-[var(--accent)]"
			>
				<ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
				Catálogo
			</a>

			<div class="flex flex-col gap-6 sm:flex-row sm:items-end">
				<!-- Cover -->
				<div
					class="volume aspect-[2/3] w-32 flex-shrink-0 rounded-[var(--radius)] shadow-2xl sm:w-40 md:w-48"
				>
					{#if displayCover}
						<img
							src={displayCover}
							alt="Capa de {displayTitle}"
							class="h-full w-full object-cover"
						/>
					{:else}
						<div class="flex h-full w-full items-center justify-center">
							<BookOpen class="h-10 w-10 text-[var(--text-muted)]" aria-hidden="true" />
						</div>
					{/if}
				</div>

				<div class="min-w-0 flex-1">
					<div class="mb-3 flex flex-wrap items-center gap-2">
						<span class="chip chip-accent">{source}</span>
						{#if chapters.length > 0}
							<span class="kicker">
								{chapters.length} capítulo{chapters.length !== 1 ? 's' : ''}
							</span>
						{/if}
					</div>
					<h1
						class="masthead text-balance text-[var(--text-primary)]"
						style="font-size:clamp(2rem, 5vw, 3.75rem)"
					>
						{displayTitle}
					</h1>
				</div>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-6xl px-6 py-10 md:px-10">
		<!-- Generos: `.chip` e o vocabulario do tema para etiqueta de genero. -->
		{#if displayGenres.length > 0}
			<div class="mb-6 flex flex-wrap gap-2">
				{#each displayGenres as slug (slug)}
					<a
						href={resolve(`/catalog?genre=${slug}`)}
						class="chip transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
					>
						{genreLabels[slug] ?? slug}
					</a>
				{/each}
			</div>
		{/if}

		<!-- Description -->
		{#if displayDescription}
			<div class="mb-8 border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
				<p class="text-sm leading-relaxed text-[var(--text-secondary)]">{displayDescription}</p>
			</div>
		{/if}

		<!-- Actions -->
		<div class="mb-10 flex flex-wrap items-center gap-4">
			<button onclick={toggleLibrary} class={inLibrary ? 'btn-ghost' : 'btn-primary'}>
				{#if inLibrary}
					<BookmarkMinus class="h-4 w-4" aria-hidden="true" />
					Remover da biblioteca
				{:else}
					<BookmarkPlus class="h-4 w-4" aria-hidden="true" />
					Adicionar à biblioteca
				{/if}
			</button>
			{#if resumeChapter}
				<a href={resolve(`/reader/${source}/${id}/${resumeChapter.source_id}`)} class="btn-ghost">
					<BookOpen class="h-4 w-4" aria-hidden="true" />
					{#if libraryManga?.lastChapterId === resumeChapter.source_id}
						Continuar{resumeChapter.chapter ? ` — Cap. ${resumeChapter.chapter}` : ''}
					{:else}
						Começar a ler
					{/if}
				</a>
			{/if}
		</div>

		<!-- Description -->
		{#if displayDescription}
			<div class="card registration mb-10 p-6">
				<p class="kicker mb-3">Sinopse</p>
				<p class="text-sm leading-relaxed text-[var(--text-secondary)]">{displayDescription}</p>
			</div>
		{/if}

		{#if downloadError}
			<div
				class="registration mb-8 flex items-start gap-3 border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-5 py-4"
			>
				<AlertTriangle
					class="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent)]"
					aria-hidden="true"
				/>
				<p class="text-sm text-[var(--text-secondary)]">{downloadError}</p>
			</div>
		{/if}

		<!-- Chapters -->
		<div class="mb-5 flex items-baseline justify-between border-b border-[var(--border)] pb-3">
			<h2 class="text-lg tracking-wide text-[var(--text-primary)] uppercase">Capítulos</h2>
			{#if chapters.length > 0}
				<span class="kicker tabular">{chapters.length} no total</span>
			{/if}
		</div>

		{#if isLoading}
			<div class="flex items-center justify-center py-16">
				<Loader2 class="h-8 w-8 animate-spin text-[var(--accent)]" aria-hidden="true" />
			</div>
		{:else if error}
			<div
				class="registration flex items-start gap-3 border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-5 py-4"
			>
				<AlertTriangle
					class="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent)]"
					aria-hidden="true"
				/>
				<p class="text-sm text-[var(--text-secondary)]">{error}</p>
			</div>
		{:else if chapters.length === 0}
			<div class="border border-dashed border-[var(--rule)] px-6 py-16 text-center">
				<p class="text-sm text-[var(--text-secondary)]">Nenhum capítulo encontrado neste idioma.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
				{#each chapters as chapter, i (chapter.source_id)}
					{@const isRead = mangaStore.isChapterRead(id, source, chapter.source_id)}
					<div
						class="group flex items-stretch border border-[var(--border)] bg-[var(--bg-secondary)] transition-colors hover:border-[var(--accent)]"
					>
						<a
							href={resolve(`/reader/${source}/${id}/${chapter.source_id}`)}
							class="flex min-w-0 flex-1 items-center gap-4 p-4"
						>
							<span class="folio flex-shrink-0" style="font-size:1.375rem">
								{String(i + 1).padStart(2, '0')}
							</span>
							<div class="min-w-0 flex-1">
								<h3
									class={[
										'flex items-center gap-2 truncate text-sm font-semibold transition-colors group-hover:text-[var(--accent)]',
										isRead ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
									].join(' ')}
								>
									{chapter.chapter ? `Cap. ${chapter.chapter}` : chapter.title || 'Sem título'}
								</h3>
								{#if chapter.title && chapter.chapter}
									<p class="truncate text-xs text-[var(--text-secondary)]">{chapter.title}</p>
								{/if}
								{#if isRead}
									<span class="stamp mt-1 text-green-500">
										<Check class="h-2.5 w-2.5" aria-hidden="true" /> Lido
									</span>
								{/if}
							</div>
						</a>

						<!-- Download Button -->
						{#if downloadedMap[chapter.source_id] === 'downloaded'}
							<button
								onclick={(e) => handleDownload(chapter, e)}
								class="flex flex-shrink-0 cursor-pointer items-center justify-center border-l border-[var(--border)] px-4 text-green-500 transition-colors group-hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
								title="Capítulo salvo offline. Clique para apagar."
							>
								<Check class="h-4 w-4" aria-hidden="true" />
							</button>
						{:else if downloadedMap[chapter.source_id] === 'downloading'}
							<div
								class="flex min-w-[3.25rem] flex-shrink-0 flex-col items-center justify-center gap-1 border-l border-[var(--border)] px-4 text-[0.5625rem] font-bold text-[var(--accent)] group-hover:border-[var(--accent)]/40"
								title="Baixando capítulo..."
							>
								<RefreshCw class="h-4 w-4 animate-spin" aria-hidden="true" />
								<span class="tabular">{downloadProgress[chapter.source_id] || 0}%</span>
							</div>
						{:else if downloadedMap[chapter.source_id] === 'partial'}
							<button
								onclick={(e) => handleDownload(chapter, e)}
								class="flex min-w-[53px] cursor-pointer flex-col items-center justify-center gap-1 border-l border-[var(--border)] p-4 text-[9px] font-bold text-amber-500 transition-colors group-hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
								title="Download incompleto. Clique para retomar."
							>
								<Download class="h-4 w-4" />
								<span>{downloadProgress[chapter.source_id] || 0}%</span>
							</button>
						{:else}
							<button
								onclick={(e) => handleDownload(chapter, e)}
								class="flex flex-shrink-0 cursor-pointer items-center justify-center border-l border-[var(--border)] px-4 text-[var(--text-muted)] transition-colors group-hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
								title="Baixar capítulo para ler offline"
							>
								<Download class="h-4 w-4" aria-hidden="true" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>
