<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Palette, Database, Shield, HardDrive, Trash2, Loader2 } from 'lucide-svelte';
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

{#snippet sectionHead(icon: typeof Palette, label: string)}
	{@const Icon = icon}
	<div class="mb-6 flex items-center gap-3 border-b border-[var(--border)] pb-3">
		<Icon class="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
		<h2 class="text-sm font-bold tracking-[0.16em] text-[var(--text-primary)] uppercase">
			{label}
		</h2>
	</div>
{/snippet}

<main class="mx-auto max-w-4xl px-6 py-10 pb-28 md:px-10 md:py-14 xl:pb-14">
	<header class="mb-12 flex items-center gap-5">
		<a
			href={resolve('/')}
			class="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-[var(--rule)] text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
		>
			<ArrowLeft class="h-4 w-4" aria-hidden="true" />
		</a>
		<div>
			<p class="kicker mb-2">Preferências</p>
			<h1 class="masthead text-[var(--text-primary)]" style="font-size:clamp(2rem, 6vw, 3.25rem)">
				Configurações
			</h1>
		</div>
	</header>

	<div class="flex flex-col gap-14">
		<!-- Estatisticas -->
		<section aria-labelledby="stats-heading">
			<h2 id="stats-heading" class="sr-only">Estatísticas</h2>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="registration border border-[var(--border)] px-4 py-6 text-center">
					<p class="folio text-[var(--accent)]">{stats.total}</p>
					<p class="kicker mt-2">Mangás</p>
				</div>
				<div class="registration border border-[var(--border)] px-4 py-6 text-center">
					<p class="folio tabular text-[var(--accent)]">
						{stats.pagesRead.toLocaleString('pt-BR')}
					</p>
					<p class="kicker mt-2">Pág. lidas</p>
				</div>
				<div class="registration border border-[var(--border)] px-4 py-6 text-center">
					<p class="folio text-[var(--accent)]">{stats.reading}</p>
					<p class="kicker mt-2">Em andamento</p>
				</div>
				<div class="registration border border-[var(--border)] px-4 py-6 text-center">
					<p class="folio text-[var(--accent)]">{stats.completed}</p>
					<p class="kicker mt-2">Concluídos</p>
				</div>
			</div>
		</section>

		<!-- Aparencia -->
		<section aria-labelledby="appearance-heading">
			<div id="appearance-heading">
				{@render sectionHead(Palette, 'Aparência')}
			</div>
			<p class="-mt-3 mb-6 text-sm text-[var(--text-secondary)]">
				Personalize as cores e o estilo do seu leitor.
			</p>
			<ThemeSwitcher />
		</section>

		<!-- Downloads -->
		<section aria-labelledby="downloads-heading">
			<div id="downloads-heading">
				{@render sectionHead(HardDrive, 'Downloads')}
			</div>
			<p class="-mt-3 mb-6 text-sm text-[var(--text-secondary)]">
				Capítulos salvos no dispositivo para leitura offline.
			</p>

			{#if downloadsLoading}
				<div class="flex items-center justify-center py-10">
					<Loader2 class="h-5 w-5 animate-spin text-[var(--accent)]" aria-hidden="true" />
				</div>
			{:else if downloads.length === 0}
				<div
					class="border border-dashed border-[var(--rule)] px-6 py-14 text-center text-sm text-[var(--text-muted)]"
				>
					Nenhum capítulo baixado ainda. Use o botão de download na lista de capítulos.
				</div>
			{:else}
				<div class="card mb-4 flex items-center justify-between p-5">
					<div>
						<p class="text-sm font-semibold text-[var(--text-primary)]">
							{downloads.length} capítulo{downloads.length !== 1 ? 's' : ''} · {formatBytes(
								totalDownloadSize
							)}
						</p>
						<p class="mt-0.5 text-xs text-[var(--text-muted)]">
							{confirmClearDownloads
								? 'Clique novamente para apagar todos.'
								: 'Espaço ocupado no dispositivo.'}
						</p>
					</div>
					<button
						onclick={handleClearDownloads}
						class={[
							'flex-shrink-0 border px-3.5 py-2 text-[0.625rem] font-bold tracking-[0.14em] uppercase transition-all',
							confirmClearDownloads
								? 'animate-pulse border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
								: 'border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10'
						].join(' ')}
					>
						{confirmClearDownloads ? 'Confirmar' : 'Apagar tudo'}
					</button>
				</div>

				<div class="flex flex-col gap-2">
					{#each downloads as item (item.source + item.mangaId + item.chapterId)}
						<div
							class="flex items-center justify-between gap-4 border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
						>
							<a
								href={resolve(`/reader/${item.source}/${item.mangaId}/${item.chapterId}`)}
								class="min-w-0 flex-1"
							>
								<h4
									class="truncate text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
								>
									{item.mangaTitle ?? item.mangaId}
								</h4>
								<p class="mt-0.5 truncate text-xs text-[var(--text-muted)]">
									{item.chapter ? `Cap. ${item.chapter}` : (item.title ?? 'Capítulo')} ·
									{item.pageCount} pág. · {formatBytes(item.sizeBytes)} · {item.source}
								</p>
							</a>
							<button
								onclick={() => removeDownload(item)}
								title="Apagar download"
								class="flex-shrink-0 p-2 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
							>
								<Trash2 class="h-4 w-4" aria-hidden="true" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Armazenamento -->
		<section aria-labelledby="storage-heading">
			<div id="storage-heading">
				{@render sectionHead(Database, 'Armazenamento')}
			</div>
			<p class="-mt-3 mb-6 text-sm text-[var(--text-secondary)]">
				Dados salvos localmente no seu dispositivo.
			</p>

			<div class="card flex items-center justify-between p-6">
				<div>
					<p class="text-sm font-semibold text-[var(--text-primary)]">Limpar biblioteca</p>
					<p class="mt-0.5 text-xs text-[var(--text-muted)]">
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
						'flex-shrink-0 border px-3.5 py-2 text-[0.625rem] font-bold tracking-[0.14em] uppercase transition-all',
						confirmClear
							? 'animate-pulse border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
							: 'border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-30'
					].join(' ')}
				>
					{confirmClear ? 'Confirmar' : 'Limpar tudo'}
				</button>
			</div>
		</section>

		<!-- Privacidade -->
		<section aria-labelledby="privacy-heading">
			<div id="privacy-heading">
				{@render sectionHead(Shield, 'Privacidade')}
			</div>
			<div class="registration border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-6">
				<p class="text-sm leading-relaxed text-[var(--text-secondary)]">
					O <strong class="text-[var(--accent)]">Hiraku</strong> guarda sua biblioteca, seu progresso
					e os capítulos baixados apenas no seu dispositivo. O servidor é usado somente para consultar
					as fontes e servir as imagens. Não coletamos dados de uso.
				</p>
			</div>
		</section>

		<footer
			class="mt-4 flex items-center justify-center gap-4 text-[0.625rem] font-bold tracking-[0.18em] text-[var(--text-muted)] uppercase"
		>
			<span>Local · v1.1</span>
			<span aria-hidden="true">·</span>
			<span>Construído com Svelte 5</span>
		</footer>
	</div>
</main>
