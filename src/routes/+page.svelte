<script lang="ts">
	import { resolve } from '$app/paths';
	import VolumeCard from '$lib/components/VolumeCard.svelte';
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import { cn } from '$lib/utils';

	// Estado local de organização e filtro
	let selectedFolderId = $state<string | null>(null);
	let searchQuery = $state('');
	let sortBy = $state<'recent' | 'title' | 'progress'>('recent');
	let isFolderModalOpen = $state(false);
	let newFolderName = $state('');

	const allMangas = $derived(mangaStore.library);
	const folders = $derived(mangaStore.folders);

	// Filtro e Ordenação dos Mangás na Estante
	const filteredMangas = $derived.by(() => {
		let list = [...allMangas];

		// Filtro por pasta/coleção
		if (selectedFolderId) {
			list = list.filter((m: Manga) => m.folderIds?.includes(selectedFolderId!));
		}

		// Filtro de busca textual
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter(
				(m: Manga) =>
					m.title.toLowerCase().includes(q) ||
					(m.author && m.author.toLowerCase().includes(q)) ||
					m.genres?.some((g: string) => g.toLowerCase().includes(q))
			);
		}

		// Ordenação
		if (sortBy === 'title') {
			list.sort((a, b) => a.title.localeCompare(b.title));
		} else if (sortBy === 'progress') {
			list.sort((a, b) => (b.progress || 0) - (a.progress || 0));
		} else {
			// 'recent'
			list.sort((a, b) => {
				const timeA = a.lastReadAt
					? new Date(a.lastReadAt).getTime()
					: new Date(a.addedAt).getTime();
				const timeB = b.lastReadAt
					? new Date(b.lastReadAt).getTime()
					: new Date(b.addedAt).getTime();
				return timeB - timeA;
			});
		}

		return list;
	});

	// Mangás em leitura ativa para a seção "Continuar Lendo"
	const continuingMangas = $derived.by(() => {
		return allMangas
			.filter((m: Manga) => (m.progress > 0 && m.progress < 100) || m.lastChapterId)
			.slice(0, 4);
	});

	function handleCreateFolder(e: SubmitEvent) {
		e.preventDefault();
		if (!newFolderName.trim()) return;
		mangaStore.createFolder(newFolderName.trim());
		newFolderName = '';
		isFolderModalOpen = false;
	}

	function handleDeleteFolder(folderId: string) {
		mangaStore.deleteFolder(folderId);
		if (selectedFolderId === folderId) {
			selectedFolderId = null;
		}
	}
</script>

<svelte:head>
	<title>Biblioteca • Hiraku</title>
</svelte:head>

<div class="space-y-8">
	<!-- Cabeçalho Limpo e Direto -->
	<header class="relative border-b border-[var(--rule)] pt-2 pb-6">
		<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div class="flex items-center gap-3">
				<span class="hanko text-xs">書棚</span>
				<h1
					class="font-serif text-3xl font-black tracking-tight text-[var(--text-primary)] uppercase sm:text-4xl"
				>
					Biblioteca
				</h1>
			</div>

			<!-- Ações -->
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={() => (isFolderModalOpen = true)}
					class="btn-tactile flex items-center gap-2 border border-[var(--rule)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase hover:border-[var(--accent)]"
				>
					<span class="text-sm font-bold text-[var(--accent)]">+</span>
					<span>Nova Coleção</span>
				</button>
				<a
					href={resolve('/catalog')}
					class="btn-tactile flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-xs font-bold tracking-wider text-[var(--bg-primary)] uppercase shadow-sm hover:brightness-110"
				>
					<span>Explorar Catálogo</span>
					<span>→</span>
				</a>
			</div>
		</div>

		<!-- Seção "Continuar Lendo" -->
		{#if continuingMangas.length > 0 && !selectedFolderId && !searchQuery.trim()}
			<section class="mt-6">
				<div class="mb-4 flex items-center justify-between border-t border-[var(--rule)] pt-4">
					<div class="flex items-center gap-2">
						<span class="h-2 w-2 bg-[var(--accent)]"></span>
						<h2
							class="font-mono text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase"
						>
							Continuar Lendo
						</h2>
					</div>
					<span class="font-mono text-[0.625rem] text-[var(--text-muted)]">
						{continuingMangas.length} em andamento
					</span>
				</div>

				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
					{#each continuingMangas as manga (manga.id)}
						<VolumeCard entry={manga} />
					{/each}
				</div>
			</section>
		{/if}
	</header>

	<!-- Barra de Controles: Pastas, Busca e Ordenação -->
	<section class="space-y-4">
		<!-- Navegação de Pastas -->
		<div class="flex items-center gap-2 overflow-x-auto border-b border-[var(--rule)] pb-2 text-xs">
			<button
				type="button"
				onclick={() => (selectedFolderId = null)}
				class={cn(
					'px-3 py-1.5 font-mono font-bold tracking-wider uppercase transition-colors',
					selectedFolderId === null
						? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
						: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
				)}
			>
				Todos ({allMangas.length})
			</button>

			{#each folders as folder (folder.id)}
				{@const count = allMangas.filter((m: Manga) => m.folderIds?.includes(folder.id)).length}
				<div class="flex items-center">
					<button
						type="button"
						onclick={() => (selectedFolderId = folder.id)}
						class={cn(
							'px-3 py-1.5 font-mono font-bold tracking-wider uppercase transition-colors',
							selectedFolderId === folder.id
								? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
								: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
						)}
					>
						{folder.name} ({count})
					</button>
					<button
						type="button"
						aria-label="Excluir coleção {folder.name}"
						onclick={() => handleDeleteFolder(folder.id)}
						class="ml-1 text-[0.625rem] text-[var(--text-muted)] hover:text-[var(--accent)]"
					>
						×
					</button>
				</div>
			{/each}
		</div>

		<!-- Busca e Ordenação -->
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="relative flex-1">
				<input
					type="search"
					bind:value={searchQuery}
					placeholder="Buscar na biblioteca..."
					class="w-full border border-[var(--rule)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
				/>
				{#if searchQuery}
					<button
						type="button"
						onclick={() => (searchQuery = '')}
						class="absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
					>
						Limpar
					</button>
				{/if}
			</div>

			<div class="flex items-center gap-2 font-mono text-xs">
				<span class="text-[var(--text-muted)] uppercase">Ordenar:</span>
				<select
					bind:value={sortBy}
					class="border border-[var(--rule)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs font-bold text-[var(--text-primary)] uppercase outline-none focus:border-[var(--accent)]"
				>
					<option value="recent">Mais Recentes</option>
					<option value="title">Título (A-Z)</option>
					<option value="progress">Progresso</option>
				</select>
			</div>
		</div>
	</section>

	<!-- Grade de Obras -->
	<main>
		{#if filteredMangas.length > 0}
			<div
				class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
			>
				{#each filteredMangas as manga (manga.id)}
					<VolumeCard entry={manga} />
				{/each}
			</div>
		{:else}
			<div
				class="registration halftone my-12 border border-[var(--rule)] bg-[var(--bg-secondary)] p-12 text-center"
			>
				<div class="mx-auto max-w-sm space-y-3">
					<span class="hanko mx-auto block w-fit text-sm">無</span>
					<h3
						class="font-serif text-lg font-black tracking-tight text-[var(--text-primary)] uppercase"
					>
						Nenhuma Obra Encontrada
					</h3>
					<p class="font-mono text-xs leading-relaxed text-[var(--text-muted)]">
						{#if searchQuery}
							Nenhum mangá corresponde aos termos da pesquisa "{searchQuery}".
						{:else if selectedFolderId}
							Esta coleção ainda está vazia. Adicione mangás a esta pasta para organizá-los.
						{:else}
							Sua biblioteca está vazia. Explore o catálogo para adicionar obras.
						{/if}
					</p>
					<div class="pt-2">
						<a
							href={resolve('/catalog')}
							class="btn-tactile inline-flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-6 py-2.5 text-xs font-bold tracking-wider text-[var(--bg-primary)] uppercase"
						>
							Explorar Catálogo →
						</a>
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>

<!-- Modal de Coleção -->
{#if isFolderModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="registration w-full max-w-md border border-[var(--rule)] bg-[var(--bg-primary)] p-6 shadow-2xl"
		>
			<div class="flex items-center justify-between border-b border-[var(--rule)] pb-4">
				<h3
					class="font-mono text-base font-black tracking-wider text-[var(--text-primary)] uppercase"
				>
					Nova Coleção
				</h3>
				<button
					type="button"
					onclick={() => (isFolderModalOpen = false)}
					class="text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
				>
					✕
				</button>
			</div>

			<form onsubmit={handleCreateFolder} class="mt-4 space-y-4">
				<div>
					<label
						for="folder-name-input"
						class="block font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase"
					>
						Nome da Coleção
					</label>
					<input
						id="folder-name-input"
						type="text"
						bind:value={newFolderName}
						placeholder="Ex: Favoritos, Shonen, Para Ler..."
						required
						class="mt-1 w-full border border-[var(--rule)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
					/>
				</div>

				<div class="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onclick={() => (isFolderModalOpen = false)}
						class="border border-[var(--rule)] px-4 py-2 font-mono text-xs font-bold text-[var(--text-muted)] uppercase hover:text-[var(--text-primary)]"
					>
						Cancelar
					</button>
					<button
						type="submit"
						class="btn-tactile border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold text-[var(--bg-primary)] uppercase"
					>
						Salvar
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
