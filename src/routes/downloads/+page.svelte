<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import { offlineService, type OfflineChapterMeta } from '$lib/services/offline';
	import { AlertTriangle, CheckCircle2, HardDrive, Loader2, Trash2 } from 'lucide-svelte';

	let chapters = $state<OfflineChapterMeta[]>([]);
	let storage = $state<{ usage: number; quota: number } | undefined>(undefined);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	/** Chave do capitulo em exclusao, para desabilitar so a linha certa. */
	let deleting = $state<string | null>(null);
	let clearConfirm = $state(false);
	let isClearing = $state(false);

	function keyOf(meta: OfflineChapterMeta): string {
		return `${meta.source}:::${meta.mangaId}:::${meta.chapterId}`;
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		const units = ['KB', 'MB', 'GB'];
		let value = bytes / 1024;
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit++;
		}
		return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
	}

	/**
	 * Agrupa por obra: a lista crua do IndexedDB e uma pilha de capitulos soltos,
	 * e o que o usuario quer decidir e "quanto esta obra ocupa".
	 */
	const groups = $derived.by(() => {
		const byManga: Record<
			string,
			{ key: string; title: string; source: string; mangaId: string; items: OfflineChapterMeta[] }
		> = {};

		for (const meta of chapters) {
			const key = `${meta.source}:::${meta.mangaId}`;
			byManga[key] ??= {
				key,
				title: meta.mangaTitle || meta.mangaId,
				source: meta.source,
				mangaId: meta.mangaId,
				items: []
			};
			byManga[key].items.push(meta);
		}

		return Object.values(byManga)
			.map((group) => ({
				...group,
				// Mais recente primeiro dentro da obra.
				items: [...group.items].sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt)),
				sizeBytes: group.items.reduce((total, item) => total + item.sizeBytes, 0)
			}))
			.sort((a, b) => b.sizeBytes - a.sizeBytes);
	});

	const totalBytes = $derived(chapters.reduce((total, item) => total + item.sizeBytes, 0));
	const partialCount = $derived(chapters.filter((item) => item.status === 'partial').length);

	async function refresh() {
		try {
			const [list, estimate] = await Promise.all([
				offlineService.getDownloadedChaptersList(),
				offlineService.estimateStorage()
			]);
			chapters = list;
			storage = estimate;
			error = null;
		} catch (err) {
			console.error(err);
			error = 'Não foi possível ler os capítulos baixados.';
		} finally {
			isLoading = false;
		}
	}

	async function handleDelete(meta: OfflineChapterMeta) {
		const key = keyOf(meta);
		deleting = key;
		try {
			await offlineService.deleteChapter(meta.source, meta.mangaId, meta.chapterId);
			// Tira da lista local em vez de reler tudo: a resposta e imediata.
			chapters = chapters.filter((item) => keyOf(item) !== key);
			storage = await offlineService.estimateStorage();
		} catch (err) {
			console.error(err);
			error = 'Não foi possível apagar este capítulo.';
		} finally {
			deleting = null;
		}
	}

	async function handleClearAll() {
		if (!clearConfirm) {
			clearConfirm = true;
			return;
		}
		isClearing = true;
		try {
			await offlineService.clearAll();
			chapters = [];
			storage = await offlineService.estimateStorage();
			error = null;
		} catch (err) {
			console.error(err);
			error = 'Não foi possível limpar os downloads.';
		} finally {
			isClearing = false;
			clearConfirm = false;
		}
	}

	function chapterLabel(meta: OfflineChapterMeta): string {
		if (meta.title) return meta.title;
		if (meta.chapter) return `Capítulo ${meta.chapter}`;
		return meta.chapterId;
	}

	onMount(refresh);
</script>

<svelte:head>
	<title>Downloads • 保存 — Hiraku (ひらく)</title>
</svelte:head>

<div class="max-w-4xl space-y-8 pb-16">
	<header class="border-b border-[var(--rule)] pt-2 pb-6">
		<div class="flex items-center gap-3">
			<span class="hanko">保存</span>
			<span class="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">
				OFFLINE STORAGE
			</span>
		</div>
		<h1
			class="mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] uppercase sm:text-5xl"
		>
			Capítulos Baixados
		</h1>
		<p class="mt-1 font-mono text-xs text-[var(--text-muted)]">
			O que está no aparelho e pode ser lido sem internet. Apague o que já leu para liberar espaço.
		</p>
	</header>

	<!-- Resumo de espaço -->
	<section class="registration border border-[var(--rule)] bg-[var(--bg-secondary)] p-5">
		<div class="flex flex-wrap items-baseline gap-x-6 gap-y-3">
			<div>
				<span class="block font-serif text-3xl font-black text-[var(--text-primary)]">
					{chapters.length}
				</span>
				<span
					class="mt-1 block font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase"
				>
					Capítulos
				</span>
			</div>
			<div>
				<span class="block font-serif text-3xl font-black text-[var(--accent)]">
					{formatBytes(totalBytes)}
				</span>
				<span
					class="mt-1 block font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase"
				>
					Ocupado pelo Hiraku
				</span>
			</div>
			{#if partialCount > 0}
				<div>
					<span class="block font-serif text-3xl font-black text-amber-500">{partialCount}</span>
					<span
						class="mt-1 block font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase"
					>
						Incompletos
					</span>
				</div>
			{/if}
		</div>

		{#if storage}
			<!--
				`usage`/`quota` sao da origem inteira e o Android costuma reportar
				uma cota bem maior que o disco livre real — por isso "estimativa".
			-->
			<div class="mt-5 border-t border-[var(--rule)] pt-4">
				<div class="mb-2 flex items-center gap-2">
					<HardDrive class="h-3.5 w-3.5 text-[var(--text-muted)]" />
					<span class="font-mono text-[0.6875rem] text-[var(--text-muted)]">
						{formatBytes(storage.usage)} de {formatBytes(storage.quota)} — estimativa do navegador
					</span>
				</div>
				<div class="h-1.5 w-full bg-[var(--bg-primary)]">
					<div
						class="h-full bg-[var(--accent)] transition-all"
						style="width: {Math.min(100, Math.round((storage.usage / storage.quota) * 100))}%;"
					></div>
				</div>
			</div>
		{/if}
	</section>

	{#if error}
		<p
			class="border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-400"
			role="alert"
		>
			{error}
		</p>
	{/if}

	{#if isLoading}
		<div class="flex items-center justify-center py-16">
			<Loader2 class="h-8 w-8 animate-spin text-[var(--accent)]" />
		</div>
	{:else if chapters.length === 0}
		<div class="border border-dashed border-[var(--rule)] p-10 text-center">
			<span class="hanko mx-auto text-xs">空</span>
			<p class="mt-3 font-mono text-xs text-[var(--text-muted)]">Nenhum capítulo baixado ainda.</p>
			<a
				href={resolve('/')}
				class="mt-4 inline-flex min-h-11 items-center border border-[var(--rule)] px-4 py-2 font-mono text-[0.6875rem] font-bold tracking-wider text-[var(--text-primary)] uppercase transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
			>
				Ir para a biblioteca
			</a>
		</div>
	{:else}
		{#each groups as group (group.key)}
			<section class="border border-[var(--rule)] bg-[var(--bg-secondary)]">
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] p-4"
				>
					<a
						href={resolve('/manga/[source]/[id]', { source: group.source, id: group.mangaId })}
						class="min-w-0 flex-1 font-serif text-base font-black text-[var(--text-primary)] uppercase transition-colors hover:text-[var(--accent)]"
					>
						{group.title}
					</a>
					<span class="font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase">
						{group.items.length} cap • {formatBytes(group.sizeBytes)}
					</span>
				</div>

				<ul>
					{#each group.items as meta (keyOf(meta))}
						<li class="flex items-center gap-3 border-b border-[var(--rule)] p-3 last:border-b-0">
							{#if meta.status === 'partial'}
								<AlertTriangle class="h-4 w-4 shrink-0 text-amber-500" />
							{:else}
								<CheckCircle2 class="h-4 w-4 shrink-0 text-[var(--accent)]" />
							{/if}

							<div class="min-w-0 flex-1">
								<p class="truncate text-xs font-bold text-[var(--text-primary)]">
									{chapterLabel(meta)}
								</p>
								<p class="font-mono text-[0.625rem] text-[var(--text-muted)]">
									{#if meta.status === 'partial'}
										{meta.pageCount} de {meta.totalPages} páginas
									{:else}
										{meta.pageCount} páginas
									{/if}
									• {formatBytes(meta.sizeBytes)}
								</p>
							</div>

							<button
								type="button"
								onclick={() => handleDelete(meta)}
								disabled={deleting === keyOf(meta)}
								aria-label="Apagar {chapterLabel(meta)}"
								class="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--rule)] text-[var(--text-muted)] transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-30"
							>
								{#if deleting === keyOf(meta)}
									<Loader2 class="h-4 w-4 animate-spin" />
								{:else}
									<Trash2 class="h-4 w-4" />
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		<div
			class="flex flex-col gap-3 border border-[var(--rule)] p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="font-mono text-[0.6875rem] text-[var(--text-muted)]">
				Apaga todos os capítulos baixados. O progresso de leitura e a biblioteca continuam.
			</p>
			<button
				type="button"
				onclick={handleClearAll}
				disabled={isClearing}
				class={cn(
					'btn-tactile min-h-11 shrink-0 border px-4 py-2 font-mono text-xs font-bold tracking-wider uppercase transition-colors disabled:opacity-50',
					clearConfirm
						? 'animate-pulse border-red-600 bg-red-600 text-white'
						: 'border-[var(--rule)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-red-500'
				)}
			>
				{#if isClearing}
					Limpando…
				{:else if clearConfirm}
					Confirmar exclusão
				{:else}
					Apagar todos
				{/if}
			</button>
		</div>
	{/if}
</div>
