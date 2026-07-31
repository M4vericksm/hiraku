<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import {
		ApiError,
		BackendApiService,
		resolveImageUrl,
		type Chapter,
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
		RefreshCw
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
				progress: 0,
				lastReadPage: 0,
				totalPage: 0,
				addedAt: new Date().toISOString()
			};
			mangaStore.addManga(newManga);
		}
	}

	// Download state management
	let downloadedMap = $state<Record<string, 'downloaded' | 'downloading' | 'not_downloaded'>>({});
	let downloadProgress = $state<Record<string, number>>({});
	let downloadError = $state<string | null>(null);

	// Check download status when chapters load
	$effect(() => {
		const currentSource = source;
		const mangaId = id;
		for (const chapter of chapters) {
			offlineService
				.isChapterDownloaded(currentSource, mangaId, chapter.source_id)
				.then((isDownloaded) => {
					// Não sobrescreve um download em andamento.
					if (downloadedMap[chapter.source_id] === 'downloading') return;
					downloadedMap[chapter.source_id] = isDownloaded ? 'downloaded' : 'not_downloaded';
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

		if (downloadedMap[cid] !== 'not_downloaded') return;

		downloadedMap[cid] = 'downloading';
		downloadProgress[cid] = 0;
		downloadError = null;
		try {
			await offlineService.downloadChapter(
				source,
				id,
				cid,
				{ title: chapter.title, chapter: chapter.chapter, mangaTitle: displayTitle },
				(progress) => {
					downloadProgress[cid] = progress;
				}
			);
			downloadedMap[cid] = 'downloaded';
		} catch (err) {
			console.error('Falha ao baixar capítulo', err);
			downloadedMap[cid] = 'not_downloaded';
			downloadError =
				err instanceof ApiError ? err.message : 'Erro ao baixar o capítulo. Tente novamente.';
		}
	}
</script>

<main class="font-body min-h-screen pb-24 text-[var(--text-primary)]">
	<!-- Hero Section -->
	<div class="relative h-[350px] overflow-hidden">
		{#if displayCover}
			<div
				class="absolute inset-0 scale-110 bg-cover bg-center opacity-15 blur-3xl"
				style="background-image: url({displayCover})"
			></div>
		{/if}
		<div
			class="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/80 to-transparent"
		></div>

		<div class="relative mx-auto flex h-full max-w-7xl items-end px-6 pb-8">
			<a
				href={resolve('/catalog')}
				class="absolute top-6 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-primary)]/80 text-[var(--text-primary)] shadow-md backdrop-blur transition-transform hover:scale-110"
			>
				<ArrowLeft class="h-5 w-5" />
			</a>

			<div class="flex w-full items-end gap-8">
				<!-- Cover -->
				{#if displayCover}
					<div
						class="card -mb-12 aspect-[3/4] w-44 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border)] shadow-2xl transition-transform duration-500 hover:scale-[1.02] md:w-56"
					>
						<img src={displayCover} alt="Capa" class="h-full w-full object-cover" />
					</div>
				{:else}
					<div
						class="card -mb-12 flex aspect-[3/4] w-44 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-accent)] shadow-2xl md:w-56"
					>
						<BookOpen class="h-12 w-12 text-[var(--text-muted)]" />
					</div>
				{/if}

				<!-- Info -->
				<div class="flex-grow pb-2">
					<div class="mb-3 flex flex-wrap gap-2">
						<span
							class="rounded-md bg-[var(--accent)] px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-[var(--accent-foreground)] uppercase"
						>
							Manga
						</span>
						<span
							class="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1 text-[10px] tracking-[0.2em] text-[var(--text-secondary)] uppercase"
						>
							{source}
						</span>
					</div>
					<h1
						class="font-display mb-4 text-3xl leading-[1.1] font-black tracking-tight md:text-5xl"
					>
						{displayTitle}
					</h1>
					{#if chapters.length > 0}
						<p class="text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase">
							{chapters.length} capítulo{chapters.length !== 1 ? 's' : ''} disponíve{chapters.length !==
							1
								? 'is'
								: 'l'}
						</p>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-7xl px-6 pt-16">
		<!-- Description -->
		{#if displayDescription}
			<div class="mb-8 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
				<p class="text-sm leading-relaxed text-[var(--text-secondary)]">{displayDescription}</p>
			</div>
		{/if}

		<!-- Actions -->
		<div class="mb-8 flex flex-wrap items-center gap-4">
			<button onclick={toggleLibrary} class="btn-primary flex items-center gap-2">
				{#if inLibrary}
					<BookmarkMinus class="h-4 w-4" /> Remover da Biblioteca
				{:else}
					<BookmarkPlus class="h-4 w-4" /> Adicionar à Biblioteca
				{/if}
			</button>
			{#if resumeChapter}
				<a
					href={resolve(`/reader/${source}/${id}/${resumeChapter.source_id}`)}
					class="flex items-center gap-2 rounded-2xl border border-[var(--accent)]/30 px-6 py-3 text-sm font-bold text-[var(--accent)] transition-all hover:bg-[var(--accent)]/5"
				>
					<BookOpen class="h-4 w-4" />
					{#if libraryManga?.lastChapterId === resumeChapter.source_id}
						Continuar{resumeChapter.chapter ? ` — Cap. ${resumeChapter.chapter}` : ''}
					{:else}
						Começar a Ler
					{/if}
				</a>
			{/if}
		</div>

		{#if downloadError}
			<div class="mb-8 rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-500">
				{downloadError}
			</div>
		{/if}

		<!-- Chapters -->
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-2xl font-bold">Capítulos</h2>
		</div>

		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<Loader2 class="h-8 w-8 animate-spin text-[var(--accent)]" />
			</div>
		{:else if error}
			<div class="rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-red-500">
				{error}
			</div>
		{:else if chapters.length === 0}
			<div class="py-12 text-center text-[var(--text-muted)]">
				Nenhum capítulo encontrado neste idioma.
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
				{#each chapters as chapter (chapter.source_id)}
					<div
						class="group flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] transition-all hover:border-[var(--accent)]"
					>
						<a
							href={resolve(`/reader/${source}/${id}/${chapter.source_id}`)}
							class="flex min-w-0 flex-1 items-center justify-between p-4"
						>
							<div class="min-w-0 flex-1">
								<h3
									class={[
										'flex items-center gap-2 font-bold transition-colors group-hover:text-[var(--accent)]',
										mangaStore.isChapterRead(id, source, chapter.source_id)
											? 'text-[var(--text-muted)]'
											: 'text-[var(--text-primary)]'
									].join(' ')}
								>
									{chapter.chapter ? `Cap. ${chapter.chapter}` : chapter.title || 'Sem título'}
									{#if mangaStore.isChapterRead(id, source, chapter.source_id)}
										<span class="text-[9px] font-black tracking-widest text-green-500 uppercase">
											lido
										</span>
									{/if}
								</h3>
								{#if chapter.title && chapter.chapter}
									<p class="truncate text-sm text-[var(--text-secondary)]">{chapter.title}</p>
								{:else}
									<p class="text-xs tracking-wider text-[var(--text-muted)] uppercase">{source}</p>
								{/if}
							</div>
						</a>

						<!-- Download Button -->
						{#if downloadedMap[chapter.source_id] === 'downloaded'}
							<button
								onclick={(e) => handleDownload(chapter, e)}
								class="flex cursor-pointer items-center justify-center border-l border-[var(--border)] p-4 text-green-500 transition-colors group-hover:border-[var(--accent)]/40 hover:text-red-500"
								title="Capítulo salvo offline. Clique para apagar."
							>
								<Check class="h-5 w-5" />
							</button>
						{:else if downloadedMap[chapter.source_id] === 'downloading'}
							<div
								class="flex min-w-[53px] flex-col items-center justify-center gap-1 border-l border-[var(--border)] p-4 text-[9px] font-bold text-[var(--accent)] group-hover:border-[var(--accent)]/40"
								title="Baixando capítulo..."
							>
								<RefreshCw class="h-4 w-4 animate-spin" />
								<span>{downloadProgress[chapter.source_id] || 0}%</span>
							</div>
						{:else}
							<button
								onclick={(e) => handleDownload(chapter, e)}
								class="flex cursor-pointer items-center justify-center border-l border-[var(--border)] p-4 text-[var(--text-muted)] transition-colors group-hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
								title="Baixar capítulo para ler offline"
							>
								<Download class="h-5 w-5" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>
