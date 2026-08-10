<script lang="ts">
	import { mangaStore, type Manga } from '$lib/stores/manga.svelte';
	import { preferences, type ReadingMode } from '$lib/stores/preferences.svelte';
	import { cn } from '$lib/utils';
	import { resolve } from '$app/paths';
	import { offlineService } from '$lib/services/offline';

	const themes: { id: string; name: string; kanji: string; desc: string }[] = [
		{
			id: 'theme-ink',
			name: 'Sumi Ink (墨)',
			kanji: '墨色',
			desc: 'Preto profundo, inspirado na tinta sumi-ê tradicional com alto contraste.'
		},
		{
			id: 'theme-neon',
			name: 'Cyber Tokyo (夜)',
			kanji: '電脳',
			desc: 'Modo escuro futurista com iluminação neon cyberpunk e tons arroxeados.'
		},
		{
			id: 'theme-paper',
			name: 'Washi Parchment (和紙)',
			kanji: '和紙',
			desc: 'Papel artesanal japonês amarelado, textura suave e conforto ocular total.'
		}
	];

	const readingModes: { id: ReadingMode; name: string; kanji: string; desc: string }[] = [
		{
			id: 'ltr',
			name: 'Leitura Ocidental (LTR)',
			kanji: '左開',
			desc: 'Esquerda para a direita. Seta → avança a página.'
		},
		{
			id: 'rtl',
			name: 'Leitura Oriental (RTL)',
			kanji: '右開',
			desc: 'Direita para a esquerda, tradicional de mangás japoneses. Seta → volta a página.'
		},
		{
			id: 'vertical',
			name: 'Webtoon / Contínuo',
			kanji: '縦読',
			desc: 'Rolagem vertical contínua para manhwas e webtoons.'
		}
	];

	// Estatísticas da Estante
	const totalMangas = $derived(mangaStore.library.length);
	const completedMangas = $derived(
		mangaStore.library.filter((m: Manga) => m.progress >= 100).length
	);
	const inProgressMangas = $derived(
		mangaStore.library.filter((m: Manga) => m.progress > 0 && m.progress < 100).length
	);

	let clearConfirm = $state(false);
	let isClearing = $state(false);

	async function handleClearAll() {
		if (!clearConfirm) {
			clearConfirm = true;
			return;
		}
		isClearing = true;
		// Os capitulos baixados vivem no IndexedDB, nao no localStorage: sem esta
		// chamada os blobs ficavam orfaos ocupando o disco, e a biblioteca que os
		// referenciava tinha acabado de sumir — nao havia mais como apaga-los.
		try {
			await offlineService.clearAll();
		} catch (err) {
			console.error('Falha ao limpar os downloads', err);
		}
		mangaStore.clearAll();
		localStorage.clear();
		window.location.reload();
	}
</script>

<svelte:head>
	<title>Configurações • 設定 — Hiraku (ひらく)</title>
</svelte:head>

<div class="max-w-4xl space-y-12 pb-16">
	<!-- Cabeçalho Editorial -->
	<header class="border-b border-[var(--rule)] pt-2 pb-6">
		<div class="flex items-center gap-3">
			<span class="hanko">設定</span>
			<span class="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">
				PREFERENCES & SYSTEM METRICS
			</span>
		</div>
		<h1
			class="mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] uppercase sm:text-5xl"
		>
			Preferências & Configurações
		</h1>
		<p class="mt-1 font-mono text-xs text-[var(--text-muted)]">
			Ajuste a identidade visual, motor de leitura tategaki e gerencie os dados offline da sua
			biblioteca.
		</p>
	</header>

	<!-- Estatísticas de Leitura (Painel Físico) -->
	<section class="registration halftone border border-[var(--rule)] bg-[var(--bg-secondary)] p-6">
		<div class="mb-4 flex items-center justify-between border-b border-[var(--rule)] pb-3">
			<div class="flex items-center gap-2">
				<span class="h-2 w-2 bg-[var(--accent)]"></span>
				<h2 class="font-mono text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase">
					Métricas da Estante • 統計
				</h2>
			</div>
			<span class="font-mono text-[0.625rem] text-[var(--text-muted)]">ESTANTE ATIVA</span>
		</div>

		<div class="grid grid-cols-3 gap-4 text-center">
			<div class="border-r border-[var(--rule)] pr-4">
				<span class="block font-serif text-3xl font-black text-[var(--text-primary)] sm:text-4xl">
					{totalMangas}
				</span>
				<span
					class="mt-1 block font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase"
				>
					Volumes Salvos
				</span>
			</div>

			<div class="border-r border-[var(--rule)] pr-4">
				<span class="block font-serif text-3xl font-black text-[var(--accent)] sm:text-4xl">
					{inProgressMangas}
				</span>
				<span
					class="mt-1 block font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase"
				>
					Em Leitura
				</span>
			</div>

			<div>
				<span class="block font-serif text-3xl font-black text-[var(--text-primary)] sm:text-4xl">
					{completedMangas}
				</span>
				<span
					class="mt-1 block font-mono text-[0.625rem] tracking-wider text-[var(--text-muted)] uppercase"
				>
					Concluídos
				</span>
			</div>
		</div>
	</section>

	<!-- Seleção de Tema Visual Editorial -->
	<section class="space-y-4">
		<div class="flex items-center gap-2 border-b border-[var(--rule)] pb-2">
			<span class="hanko text-xs">色彩</span>
			<h2 class="font-mono text-sm font-bold tracking-wider text-[var(--text-primary)] uppercase">
				Tema Visual & Paleta Japonesa
			</h2>
		</div>

		<div class="grid gap-4 sm:grid-cols-3">
			{#each themes as theme (theme.id)}
				<button
					type="button"
					onclick={() => preferences.setTheme(theme.id)}
					class={cn(
						'registration group flex flex-col justify-between border p-5 text-left transition-all duration-300',
						preferences.theme === theme.id
							? 'border-[var(--accent)] bg-[var(--bg-secondary)] shadow-md'
							: 'border-[var(--rule)] bg-[var(--bg-primary)] opacity-70 hover:opacity-100'
					)}
				>
					<div>
						<div class="flex items-center justify-between">
							<span class="hanko text-[0.5625rem]">{theme.kanji}</span>
							{#if preferences.theme === theme.id}
								<span class="font-mono text-[0.625rem] font-bold text-[var(--accent)] uppercase">
									ATIVO
								</span>
							{/if}
						</div>

						<h3
							class="mt-3 font-serif text-base font-black tracking-tight text-[var(--text-primary)] uppercase"
						>
							{theme.name}
						</h3>

						<p class="mt-1 font-mono text-[0.6875rem] leading-relaxed text-[var(--text-muted)]">
							{theme.desc}
						</p>
					</div>

					<div
						class="mt-6 flex items-center justify-between border-t border-[var(--rule)] pt-3 font-mono text-[0.5625rem] text-[var(--text-muted)]"
					>
						<span>PALETA JAPONESA</span>
						<span>HIRAKU</span>
					</div>
				</button>
			{/each}
		</div>
	</section>

	<!-- Modo Padrão do Leitor -->
	<section class="space-y-4">
		<div class="flex items-center gap-2 border-b border-[var(--rule)] pb-2">
			<span class="hanko text-xs">読法</span>
			<h2 class="font-mono text-sm font-bold tracking-wider text-[var(--text-primary)] uppercase">
				Direção e Motor de Leitura
			</h2>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			{#each readingModes as mode (mode.id)}
				<button
					type="button"
					onclick={() => preferences.setReadingMode(mode.id)}
					class={cn(
						'registration border p-4 text-left transition-all',
						preferences.readingMode === mode.id
							? 'border-[var(--accent)] bg-[var(--bg-secondary)]'
							: 'border-[var(--rule)] bg-[var(--bg-primary)] opacity-70 hover:opacity-100'
					)}
				>
					<div class="flex items-center justify-between">
						<span class="hanko text-[0.5625rem]">{mode.kanji}</span>
						{#if preferences.readingMode === mode.id}
							<span class="font-mono text-[0.625rem] font-bold text-[var(--accent)] uppercase">
								PADRÃO
							</span>
						{/if}
					</div>

					<h3 class="mt-2 font-serif text-sm font-black text-[var(--text-primary)] uppercase">
						{mode.name}
					</h3>
					<p class="mt-1 font-mono text-xs text-[var(--text-muted)]">
						{mode.desc}
					</p>
				</button>
			{/each}
		</div>
	</section>

	<!-- Zona de Gerenciamento de Armazenamento e Limpeza -->
	<section class="space-y-4 pt-6">
		<div class="flex items-center gap-2 border-b border-[var(--rule)] pb-2">
			<span class="hanko text-xs">管理</span>
			<h2 class="font-mono text-sm font-bold tracking-wider text-[var(--text-primary)] uppercase">
				Armazenamento Local & Cache
			</h2>
		</div>

		<div
			class="flex flex-col gap-4 border border-[var(--rule)] bg-[var(--bg-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div>
				<h3 class="font-mono text-xs font-bold text-[var(--text-primary)] uppercase">
					Capítulos Baixados
				</h3>
				<p class="font-mono text-[0.6875rem] text-[var(--text-muted)]">
					Veja quanto espaço cada obra ocupa e apague capítulo por capítulo.
				</p>
			</div>

			<a
				href={resolve('/downloads')}
				class="btn-tactile inline-flex min-h-11 shrink-0 items-center justify-center border border-[var(--rule)] bg-[var(--bg-primary)] px-4 py-2 font-mono text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
			>
				Gerenciar Downloads
			</a>
		</div>

		<div
			class="flex flex-col gap-4 border border-[var(--rule)] bg-[var(--bg-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div>
				<h3 class="font-mono text-xs font-bold text-[var(--text-primary)] uppercase">
					Limpar Todos os Dados e Biblioteca
				</h3>
				<p class="font-mono text-[0.6875rem] text-[var(--text-muted)]">
					Remove todo o progresso de leitura, coleções criadas, preferências salvas e os capítulos
					baixados.
				</p>
			</div>

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
					Confirmar Exclusão Definitiva
				{:else}
					Limpar Dados
				{/if}
			</button>
		</div>
	</section>
</div>
