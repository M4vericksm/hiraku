<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowLeft,
		Palette,
		Database,
		Shield,
		Globe,
		BarChart2,
		HardDrive,
		Trash2,
		Loader2
	} from 'lucide-svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { offlineService, type OfflineChapterMeta } from '$lib/services/offline';
	import { formatBytes } from '$lib/utils';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let confirmClear = $state(false);
	let confirmClearDownloads = $state(false);

	let downloads = $state<OfflineChapterMeta[]>([]);
	let downloadsLoading = $state(true);

	const totalDownloadSize = $derived(downloads.reduce((sum, d) => sum + (d.sizeBytes || 0), 0));

	const stats = $derived({
		total: mangaStore.library.length,
		totalPages: mangaStore.library.reduce((s, m) => s + (m.totalPage || 0), 0),
		pagesRead: mangaStore.library.reduce((s, m) => s + (m.lastReadPage || 0), 0),
		completed: mangaStore.library.filter((m) => m.progress >= 100).length,
		reading: mangaStore.library.filter((m) => m.progress > 0 && m.progress < 100).length
	});

	async function refreshDownloads() {
		downloadsLoading = true;
		try {
			const list = await offlineService.getDownloadedChaptersList();
			downloads = list.sort(
				(a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
			);
		} catch (err) {
			console.error('Falha ao listar downloads', err);
		} finally {
			downloadsLoading = false;
		}
	}

	onMount(refreshDownloads);

	async function removeDownload(item: OfflineChapterMeta) {
		await offlineService.deleteChapter(item.source, item.mangaId, item.chapterId);
		await refreshDownloads();
	}

	async function handleClearDownloads() {
		if (!confirmClearDownloads) {
			confirmClearDownloads = true;
			setTimeout(() => (confirmClearDownloads = false), 4000);
			return;
		}
		await offlineService.clearAll();
		confirmClearDownloads = false;
		await refreshDownloads();
	}

	function handleClearAll() {
		if (!confirmClear) {
			confirmClear = true;
			setTimeout(() => (confirmClear = false), 4000);
			return;
		}
		mangaStore.clearAll();
		confirmClear = false;
		goto(resolve('/'));
	}
</script>

<main class="mx-auto max-w-4xl px-6 py-12 pb-24 text-[var(--text-primary)]">
	<header class="mb-12 flex items-center gap-4">
		<a
			href={resolve('/')}
			class="rounded-full p-2 transition-colors hover:bg-[var(--bg-secondary)]"
		>
			<ArrowLeft class="h-6 w-6" />
		</a>
		<h1 class="font-display text-4xl font-bold text-[var(--accent)]">Configurações</h1>
	</header>

	<div class="flex flex-col gap-12">
		<!-- Stats Section -->
		<section>
			<div class="mb-6 flex items-center gap-3">
				<BarChart2 class="h-6 w-6 text-[var(--accent)]" />
				<h2 class="font-display flex-grow border-b border-[var(--border)] pb-1 text-xl font-bold">
					Estatísticas
				</h2>
			</div>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div
					class="card rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] p-5 text-center"
				>
					<p class="font-display text-3xl font-black text-[var(--accent)]">{stats.total}</p>
					<p class="font-body mt-1 text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
						Mangás
					</p>
				</div>
				<div
					class="card rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] p-5 text-center"
				>
					<p class="font-display text-3xl font-black text-[var(--accent)]">
						{stats.pagesRead.toLocaleString('pt-BR')}
					</p>
					<p class="font-body mt-1 text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
						Pág. Lidas
					</p>
				</div>
				<div
					class="card rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] p-5 text-center"
				>
					<p class="font-display text-3xl font-black text-[var(--accent)]">{stats.reading}</p>
					<p class="font-body mt-1 text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
						Em Andamento
					</p>
				</div>
				<div
					class="card rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] p-5 text-center"
				>
					<p class="font-display text-3xl font-black text-[var(--accent)]">{stats.completed}</p>
					<p class="font-body mt-1 text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
						Concluídos
					</p>
				</div>
			</div>
		</section>

		<!-- Appearance Section -->
		<section>
			<div class="mb-6 flex items-center gap-3">
				<Palette class="h-6 w-6 text-[var(--accent)]" />
				<h2 class="font-display flex-grow border-b border-[var(--border)] pb-1 text-xl font-bold">
					Aparência
				</h2>
			</div>
			<p class="font-body -mt-4 mb-6 text-sm text-[var(--text-secondary)]">
				Personalize as cores e o estilo do seu leitor.
			</p>

			<ThemeSwitcher />
		</section>

		<!-- Downloads Section -->
		<section>
			<div class="mb-6 flex items-center gap-3">
				<HardDrive class="h-6 w-6 text-[var(--accent)]" />
				<h2 class="font-display flex-grow border-b border-[var(--border)] pb-1 text-xl font-bold">
					Downloads
				</h2>
			</div>
			<p class="font-body -mt-4 mb-6 text-sm text-[var(--text-secondary)]">
				Capítulos salvos no dispositivo para leitura offline.
			</p>

			{#if downloadsLoading}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin text-[var(--accent)]" />
				</div>
			{:else if downloads.length === 0}
				<div
					class="card rounded-[var(--radius)] border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]"
				>
					Nenhum capítulo baixado ainda. Use o botão de download na lista de capítulos.
				</div>
			{:else}
				<div
					class="card mb-4 flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] p-6"
				>
					<div>
						<h4 class="font-body mb-1 font-bold">
							{downloads.length} capítulo{downloads.length !== 1 ? 's' : ''} · {formatBytes(
								totalDownloadSize
							)}
						</h4>
						<p class="font-body text-xs text-[var(--text-muted)]">
							{confirmClearDownloads
								? 'Clique novamente para apagar todos.'
								: 'Espaço ocupado no dispositivo.'}
						</p>
					</div>
					<button
						onclick={handleClearDownloads}
						class={[
							'rounded-[var(--radius)] px-4 py-2 text-sm font-bold uppercase transition-all',
							confirmClearDownloads
								? 'animate-pulse bg-red-500 text-white'
								: 'border border-red-500/30 text-red-500 hover:bg-red-500/10'
						].join(' ')}
					>
						{confirmClearDownloads ? 'CONFIRMAR' : 'APAGAR TUDO'}
					</button>
				</div>

				<div class="flex flex-col gap-2">
					{#each downloads as item (item.source + item.mangaId + item.chapterId)}
						<div
							class="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
						>
							<a
								href={resolve(`/reader/${item.source}/${item.mangaId}/${item.chapterId}`)}
								class="min-w-0 flex-1"
							>
								<h4 class="font-body truncate text-sm font-bold hover:text-[var(--accent)]">
									{item.mangaTitle ?? item.mangaId}
								</h4>
								<p class="font-body mt-0.5 truncate text-xs text-[var(--text-muted)]">
									{item.chapter ? `Cap. ${item.chapter}` : (item.title ?? 'Capítulo')} ·
									{item.pageCount} pág. · {formatBytes(item.sizeBytes)} · {item.source}
								</p>
							</a>
							<button
								onclick={() => removeDownload(item)}
								title="Apagar download"
								class="flex-shrink-0 rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Storage Section -->
		<section>
			<div class="mb-6 flex items-center gap-3">
				<Database class="h-6 w-6 text-[var(--accent)]" />
				<h2 class="font-display flex-grow border-b border-[var(--border)] pb-1 text-xl font-bold">
					Armazenamento
				</h2>
			</div>
			<p class="font-body -mt-4 mb-6 text-sm text-[var(--text-secondary)]">
				Dados salvos localmente no seu dispositivo.
			</p>

			<div
				class="card flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] p-6"
			>
				<div>
					<h4 class="font-body mb-1 font-bold">Limpar Biblioteca</h4>
					<p class="font-body text-xs text-[var(--text-muted)]">
						{mangaStore.library.length} mangá{mangaStore.library.length !== 1 ? 's' : ''} na biblioteca.
						{confirmClear
							? 'Clique novamente para confirmar.'
							: 'Remove todos os mangás e o progresso.'}
					</p>
				</div>
				<button
					onclick={handleClearAll}
					disabled={mangaStore.library.length === 0}
					class={[
						'rounded-[var(--radius)] px-4 py-2 text-sm font-bold uppercase transition-all',
						confirmClear
							? 'animate-pulse bg-red-500 text-white'
							: 'border border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30'
					].join(' ')}
				>
					{confirmClear ? 'CONFIRMAR' : 'LIMPAR TUDO'}
				</button>
			</div>
		</section>

		<!-- Privacy Section -->
		<section>
			<div class="mb-6 flex items-center gap-3">
				<Shield class="h-6 w-6 text-[var(--accent)]" />
				<h2 class="font-display flex-grow border-b border-[var(--border)] pb-1 text-xl font-bold">
					Privacidade
				</h2>
			</div>
			<div
				class="card rounded-[var(--radius)] border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-6"
			>
				<p class="font-body text-sm leading-relaxed">
					O <strong class="text-[var(--accent)]">Hiraku</strong> guarda sua biblioteca, seu progresso
					e os capítulos baixados apenas no seu dispositivo. O servidor é usado somente para consultar
					as fontes e servir as imagens. Não coletamos dados de uso.
				</p>
			</div>
		</section>

		<footer
			class="font-body mt-12 flex items-center justify-center gap-6 text-sm text-[var(--text-muted)] italic"
		>
			<div class="flex items-center gap-2">
				<Globe class="h-4 w-4" /> v1.1
			</div>
			<span>•</span>
			<span>Orgulhosamente construído com Svelte 5</span>
		</footer>
	</div>
</main>
