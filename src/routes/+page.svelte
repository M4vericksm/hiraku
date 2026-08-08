<script lang="ts">
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import {
		Search,
		Filter,
		BookOpen,
		Trash2,
		ChevronDown,
		Compass,
		Plus,
		Check,
		X,
		Pencil,
		FolderPlus,
		Library
	} from 'lucide-svelte';
	import { resolve } from '$app/paths';

	type SortKey = 'addedAt' | 'title' | 'progress' | 'lastReadAt';
	type FilterKey = 'all' | 'reading' | 'completed' | 'unread';

	let searchQuery = $state('');
	let deletingId = $state<string | null>(null);
	let sortBy = $state<SortKey>('addedAt');
	let filterBy = $state<FilterKey>('all');
	let filterMenuOpen = $state(false);

	/** Pasta selecionada na faixa de abas. null = "Todos". */
	let activeFolderId = $state<string | null>(null);
	let creatingFolder = $state(false);
	let newFolderName = $state('');
	let renamingFolderId = $state<string | null>(null);
	let renameValue = $state('');
	let folderToDelete = $state<string | null>(null);
	/** Manga cujo seletor de pastas esta aberto (modal). */
	let pickerTarget = $state<Manga | null>(null);
	let pickerNewFolder = $state('');

	/**
	 * Resolve a aba ativa contra as pastas que realmente existem em vez de
	 * "corrigir" activeFolderId num $effect. Assim, quando a pasta selecionada e
	 * excluida, a biblioteca cai sozinha em "Todos" — sem efeito que le e escreve
	 * o mesmo estado, que ja causou loop reativo neste projeto.
	 */
	const activeFolder = $derived(activeFolderId ? mangaStore.findFolder(activeFolderId) : undefined);

	const SORT_LABELS: Record<SortKey, string> = {
		addedAt: 'Adicionado',
		title: 'Título',
		progress: 'Progresso',
		lastReadAt: 'Última leitura'
	};

	const FILTER_LABELS: Record<FilterKey, string> = {
		all: 'Todos',
		reading: 'Em andamento',
		completed: 'Concluídos',
		unread: 'Não iniciados'
	};

	const filteredLibrary = $derived(() => {
		let list = mangaStore.library.filter((m) =>
			m.title.toLowerCase().includes(searchQuery.toLowerCase())
		);

		// A pasta e mais um filtro em cadeia: busca, pasta, status e ordenacao
		// continuam valendo todos ao mesmo tempo.
		if (activeFolder) list = list.filter((m) => m.folderIds?.includes(activeFolder.id));

		if (filterBy === 'reading') list = list.filter((m) => m.progress > 0 && m.progress < 100);
		else if (filterBy === 'completed') list = list.filter((m) => m.progress >= 100);
		else if (filterBy === 'unread') list = list.filter((m) => m.progress === 0);

		list = [...list].sort((a, b) => {
			if (sortBy === 'title') return a.title.localeCompare(b.title);
			if (sortBy === 'progress') return b.progress - a.progress;
			if (sortBy === 'lastReadAt') {
				return (
					(b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0) -
					(a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0)
				);
			}
			return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
		});

		return list;
	});

	/**
	 * Da biblioteca sempre para a pagina do manga, nunca direto para o leitor.
	 *
	 * La estao a sinopse, a lista de capitulos e o botao "Continuar" — abrir o
	 * leitor de imediato tirava do usuario a chance de escolher outro capitulo.
	 */
	function mangaHref(manga: { id: string; source: string }) {
		return resolve(`/manga/${manga.source}/${manga.id}`);
	}

	function confirmCreateFolder() {
		const folder = mangaStore.createFolder(newFolderName);
		// Ja abre a pasta recem-criada: o usuario criou para usar agora.
		if (folder) activeFolderId = folder.id;
		newFolderName = '';
		creatingFolder = false;
	}

	function startRename(folderId: string, currentName: string) {
		renamingFolderId = folderId;
		renameValue = currentName;
		folderToDelete = null;
	}

	function confirmRename() {
		if (renamingFolderId) mangaStore.renameFolder(renamingFolderId, renameValue);
		renamingFolderId = null;
		renameValue = '';
	}

	function confirmDeleteFolder(folderId: string) {
		mangaStore.deleteFolder(folderId);
		// Nao mexemos em activeFolderId: activeFolder deriva das pastas existentes
		// e volta para "Todos" sozinho.
		folderToDelete = null;
		renamingFolderId = null;
	}

	function openPicker(manga: Manga, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		pickerTarget = manga;
		pickerNewFolder = '';
	}

	function createFolderForPicker() {
		if (!pickerTarget) return;
		const folder = mangaStore.createFolder(pickerNewFolder);
		if (folder) mangaStore.addMangaToFolder(pickerTarget.id, pickerTarget.source, folder.id);
		pickerNewFolder = '';
	}

	function requestDelete(source: string, id: string, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (deletingId === id) {
			mangaStore.removeManga(id, source);
			deletingId = null;
		} else {
			deletingId = id;
			setTimeout(() => {
				if (deletingId === id) deletingId = null;
			}, 3000);
		}
	}
</script>

<main class="font-body mx-auto max-w-7xl px-6 py-12 pb-24 text-[var(--text-primary)]">
	<header class="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-center">
		<div>
			<h1 class="font-display mb-2 text-4xl font-bold text-[var(--accent)] md:text-5xl">Hiraku</h1>
			<p class="text-lg text-[var(--text-secondary)]">Sua biblioteca pessoal de mangás.</p>
		</div>

		<div class="flex items-center gap-3">
			<div class="group relative">
				<Search
					class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent)]"
				/>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Buscar na biblioteca..."
					class="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] py-2 pr-4 pl-10 transition-all focus:border-[var(--accent)] focus:outline-none md:w-64"
				/>
			</div>
			<div class="relative">
				<button
					onclick={() => (filterMenuOpen = !filterMenuOpen)}
					class="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] p-2 px-3 transition-colors hover:bg-[var(--bg-secondary)]"
				>
					<Filter class="h-4 w-4" />
					<span class="hidden text-xs font-bold sm:block"
						>{filterBy !== 'all' || sortBy !== 'addedAt' ? '·' : ''}</span
					>
					<ChevronDown class="h-3 w-3 opacity-50" />
				</button>
				{#if filterMenuOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute top-full right-0 z-50 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 shadow-2xl"
						onmouseleave={() => (filterMenuOpen = false)}
					>
						<p
							class="mb-1 px-2 text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase"
						>
							Ordenar
						</p>
						{#each Object.entries(SORT_LABELS) as [key, label] (key)}
							<button
								onclick={() => {
									sortBy = key as SortKey;
								}}
								class="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-accent)]/10 {sortBy ===
								key
									? 'font-bold text-[var(--accent)]'
									: ''}"
							>
								{label}
								{#if sortBy === key}<span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
									></span>{/if}
							</button>
						{/each}
						<div class="my-1 border-t border-[var(--border)]"></div>
						<p
							class="mb-1 px-2 text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase"
						>
							Filtrar
						</p>
						{#each Object.entries(FILTER_LABELS) as [key, label] (key)}
							<button
								onclick={() => {
									filterBy = key as FilterKey;
								}}
								class="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-accent)]/10 {filterBy ===
								key
									? 'font-bold text-[var(--accent)]'
									: ''}"
							>
								{label}
								{#if filterBy === key}<span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
									></span>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</header>

	{#if mangaStore.isLoading}
		<div class="flex items-center justify-center py-24">
			<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--accent)]"></div>
		</div>
	{:else if mangaStore.library.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] px-6 py-24 text-center"
		>
			<div
				class="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-secondary)]"
			>
				<BookOpen class="h-10 w-10 text-[var(--text-muted)]" />
			</div>
			<h2 class="mb-2 text-2xl">Sua biblioteca está vazia</h2>
			<p class="mb-8 max-w-md text-[var(--text-secondary)]">
				Explore o catálogo e adicione mangás à sua biblioteca.
			</p>
			<a href={resolve('/catalog')} class="btn-primary flex items-center gap-2">
				<Compass class="h-5 w-5" />
				Explorar Catálogo
			</a>
		</div>
	{:else}
		<!-- Faixa de pastas: "Todos" fixo a esquerda + as pastas do usuario. -->
		<nav class="mb-10 flex flex-wrap items-center gap-2">
			<button
				onclick={() => (activeFolderId = null)}
				class="flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors {activeFolder ===
				undefined
					? 'border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-foreground)]'
					: 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
			>
				<Library class="h-3.5 w-3.5" />
				Todos
				<span class="text-xs opacity-60">{mangaStore.library.length}</span>
			</button>

			{#each mangaStore.folders as folder (folder.id)}
				{#if renamingFolderId === folder.id}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							confirmRename();
						}}
						class="flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--bg-secondary)] py-1 pr-1 pl-3"
					>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							bind:value={renameValue}
							autofocus
							onkeydown={(e) => {
								if (e.key === 'Escape') renamingFolderId = null;
							}}
							class="w-28 bg-transparent text-sm focus:outline-none"
						/>
						<button type="submit" title="Salvar nome" class="p-1 text-[var(--accent)]">
							<Check class="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							title="Cancelar"
							onclick={() => (renamingFolderId = null)}
							class="p-1 text-[var(--text-muted)]"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</form>
				{:else}
					<div
						class="group/folder flex items-center rounded-full border transition-colors {activeFolder?.id ===
						folder.id
							? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
							: 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
					>
						<button
							onclick={() => (activeFolderId = folder.id)}
							class="flex items-center gap-1.5 py-1.5 pl-4 text-sm {activeFolder?.id === folder.id
								? 'font-bold'
								: ''}"
						>
							{folder.name}
							<span class="text-xs opacity-60">{mangaStore.folderCount(folder.id)}</span>
						</button>
						<!-- Editar/excluir so aparecem no hover para a faixa nao virar um painel. -->
						<span
							class="flex items-center gap-0.5 pr-2 pl-1.5 opacity-0 transition-opacity group-hover/folder:opacity-100 focus-within:opacity-100"
						>
							<button
								title="Renomear pasta"
								onclick={() => startRename(folder.id, folder.name)}
								class="rounded p-1 hover:text-[var(--accent)]"
							>
								<Pencil class="h-3 w-3" />
							</button>
							<button
								title={folderToDelete === folder.id
									? 'Confirmar exclusão da pasta'
									: 'Excluir pasta (os mangás continuam na biblioteca)'}
								onclick={() =>
									folderToDelete === folder.id
										? confirmDeleteFolder(folder.id)
										: (folderToDelete = folder.id)}
								class="rounded p-1 {folderToDelete === folder.id
									? 'bg-red-500 text-white'
									: 'hover:text-red-500'}"
							>
								<Trash2 class="h-3 w-3" />
							</button>
						</span>
					</div>
				{/if}
			{/each}

			{#if creatingFolder}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						confirmCreateFolder();
					}}
					class="flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--bg-secondary)] py-1 pr-1 pl-3"
				>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={newFolderName}
						autofocus
						placeholder="Nome da pasta"
						onkeydown={(e) => {
							if (e.key === 'Escape') {
								creatingFolder = false;
								newFolderName = '';
							}
						}}
						class="w-32 bg-transparent text-sm placeholder:text-[var(--text-muted)] focus:outline-none"
					/>
					<button type="submit" title="Criar pasta" class="p-1 text-[var(--accent)]">
						<Check class="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						title="Cancelar"
						onclick={() => {
							creatingFolder = false;
							newFolderName = '';
						}}
						class="p-1 text-[var(--text-muted)]"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				</form>
			{:else}
				<button
					onclick={() => (creatingFolder = true)}
					title="Criar pasta"
					class="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-4 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
				>
					<FolderPlus class="h-3.5 w-3.5" />
					Nova pasta
				</button>
			{/if}
		</nav>

		{#if mangaStore.recentManga.length > 0}
			<section class="mb-16">
				<h3 class="mb-6 text-sm text-xl tracking-widest uppercase opacity-60">Continuar Lendo</h3>
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{#each mangaStore.recentManga.slice(0, 2) as manga (manga.id + manga.source)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- mangaHref() ja aplica resolve() -->
						<a
							href={mangaHref(manga)}
							class="card group flex h-48 cursor-pointer transition-colors hover:border-[var(--accent)]"
						>
							<div class="relative w-32 flex-shrink-0 bg-[var(--bg-accent)]">
								{#if manga.coverUrl}
									<img src={manga.coverUrl} alt="Capa" class="h-full w-full object-cover" />
								{:else}
									<div class="flex h-full w-full items-center justify-center">
										<BookOpen class="h-8 w-8 text-[var(--text-muted)]" />
									</div>
								{/if}
							</div>
							<div class="flex flex-1 flex-col p-5">
								<h4
									class="mb-1 line-clamp-2 text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)]"
								>
									{manga.title}
								</h4>
								<p class="text-sm text-[var(--text-secondary)]">
									{manga.lastChapterLabel || manga.author || 'Continuar leitura'}
								</p>
								<div class="mt-4 flex items-center justify-between">
									<span class="text-sm text-[var(--text-muted)]">
										{manga.totalPage > 0
											? `Pág. ${manga.lastReadPage} / ${manga.totalPage}`
											: 'Começar'}
									</span>
									<div class="text-[var(--accent)] transition-transform group-hover:translate-x-1">
										<BookOpen class="h-6 w-6" />
									</div>
								</div>
							</div>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<h3 class="mb-6 text-sm text-xl tracking-widest uppercase opacity-60">
				{activeFolder ? activeFolder.name : 'Minha Biblioteca'}
			</h3>
			{#if filteredLibrary().length === 0}
				<div
					class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] px-6 py-16 text-center"
				>
					<p class="text-[var(--text-secondary)]">
						{activeFolder
							? `Nenhum mangá em "${activeFolder.name}" com os filtros atuais.`
							: 'Nenhum mangá corresponde aos filtros atuais.'}
					</p>
					{#if activeFolder}
						<p class="mt-2 text-sm text-[var(--text-muted)]">
							Use o ícone de pasta na capa de um mangá para adicioná-lo aqui.
						</p>
					{/if}
				</div>
			{/if}
			<div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each filteredLibrary() as manga (manga.id + manga.source)}
					<div class="group relative cursor-pointer">
						<a href={resolve(`/manga/${manga.source}/${manga.id}`)}>
							<div
								class="card relative mb-3 aspect-[3/4] transition-transform duration-300 group-hover:-translate-y-2"
							>
								{#if manga.coverUrl}
									<img src={manga.coverUrl} alt="Capa" class="h-full w-full object-cover" />
								{:else}
									<div class="flex h-full w-full items-center justify-center">
										<BookOpen class="h-8 w-8 text-[var(--text-muted)]" />
									</div>
								{/if}
								<div
									class="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent pb-4 opacity-0 transition-opacity group-hover:opacity-100"
								>
									<span
										class="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[10px] font-black tracking-widest text-white uppercase"
									>
										<BookOpen class="h-3 w-3" /> ABRIR
									</span>
								</div>
								{#if manga.progress > 0}
									<div class="absolute bottom-0 left-0 h-1.5 w-full bg-black/40">
										<div class="h-full bg-[var(--accent)]" style="width: {manga.progress}%"></div>
									</div>
								{/if}
							</div>
							<h4
								class="font-body line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-[var(--accent)]"
							>
								{manga.title}
							</h4>
						</a>
						<button
							onclick={(e) => requestDelete(manga.source, manga.id, e)}
							title={deletingId === manga.id ? 'Confirmar exclusão' : 'Remover da biblioteca'}
							class={[
								'absolute top-1 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all',
								deletingId === manga.id
									? 'scale-110 bg-red-500 text-white opacity-100'
									: 'bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500'
							].join(' ')}
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
						<button
							onclick={(e) => openPicker(manga, e)}
							title="Organizar em pastas"
							class="absolute top-1 left-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--accent)]"
						>
							<FolderPlus class="h-3.5 w-3.5" />
						</button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if pickerTarget}
		<!--
			Seletor de pastas do manga. Lemos a pertinencia direto do store a cada
			render (mangaStore.isMangaInFolder) em vez de copiar para um estado local:
			a marcacao nunca sai de sincronia com a biblioteca.
		-->
		<div
			class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
			role="presentation"
			onclick={() => (pickerTarget = null)}
		>
			<div
				class="card w-full max-w-sm p-5"
				role="dialog"
				tabindex="-1"
				aria-modal="true"
				aria-label="Organizar em pastas"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => {
					if (e.key === 'Escape') pickerTarget = null;
				}}
			>
				<div class="mb-4 flex items-start justify-between gap-3">
					<div>
						<p class="text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase">
							Organizar em pastas
						</p>
						<h4 class="line-clamp-2 text-lg font-bold">{pickerTarget.title}</h4>
					</div>
					<button
						onclick={() => (pickerTarget = null)}
						title="Fechar"
						class="rounded p-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				{#if mangaStore.folders.length === 0}
					<p class="mb-4 text-sm text-[var(--text-secondary)]">
						Você ainda não tem pastas. Crie a primeira abaixo.
					</p>
				{:else}
					<div class="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
						{#each mangaStore.folders as folder (folder.id)}
							{@const checked = mangaStore.isMangaInFolder(
								pickerTarget.id,
								pickerTarget.source,
								folder.id
							)}
							<button
								onclick={() =>
									pickerTarget &&
									mangaStore.toggleMangaFolder(pickerTarget.id, pickerTarget.source, folder.id)}
								class="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-accent)]/40"
							>
								<span class={checked ? 'font-bold text-[var(--accent)]' : ''}>{folder.name}</span>
								<span
									class="flex h-4 w-4 items-center justify-center rounded border {checked
										? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
										: 'border-[var(--border)]'}"
								>
									{#if checked}<Check class="h-3 w-3" />{/if}
								</span>
							</button>
						{/each}
					</div>
				{/if}

				<form
					onsubmit={(e) => {
						e.preventDefault();
						createFolderForPicker();
					}}
					class="flex items-center gap-2 border-t border-[var(--border)] pt-4"
				>
					<input
						bind:value={pickerNewFolder}
						placeholder="Criar e adicionar a..."
						class="flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
					/>
					<button type="submit" class="btn-primary flex items-center gap-1.5 !px-3 !py-2 text-sm">
						<Plus class="h-4 w-4" />
					</button>
				</form>
			</div>
		</div>
	{/if}
</main>
