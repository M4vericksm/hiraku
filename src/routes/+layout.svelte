<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base, resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { initBackButton, destroyBackButton } from '$lib/services/backButton';
	import { Settings, Library, Compass } from 'lucide-svelte';

	let { children } = $props();

	// O tema vem do store; trocar aplica na hora, sem recarregar a pagina.
	const currentTheme = $derived(preferences.theme);

	onMount(() => {
		void initBackButton();

		if ('serviceWorker' in navigator) {
			const swUrl = `${base}/sw.js`;
			void navigator.serviceWorker.register(swUrl);
		}

		return () => void destroyBackButton();
	});

	const isReader = $derived(page.route.id?.startsWith('/reader'));

	const NAV = [
		{ route: '/', href: resolve('/'), label: 'Biblioteca', kanji: '本棚', icon: Library },
		{
			route: '/catalog',
			href: resolve('/catalog'),
			label: 'Catálogo',
			kanji: '探索',
			icon: Compass
		},
		{
			route: '/settings',
			href: resolve('/settings'),
			label: 'Ajustes',
			kanji: '設定',
			icon: Settings
		}
	] as const;

	// A pagina do manga e do leitor pertencem ao ramo "catalogo/biblioteca"
	function isActive(route: string) {
		const current = page.route.id ?? '/';
		if (route === '/') return current === '/';
		return current.startsWith(route);
	}
</script>

<svelte:head>
	<title>Hiraku — leitor de mangá</title>
	<meta
		name="description"
		content="Hiraku é um leitor de mangá: biblioteca local com pastas, busca em múltiplas fontes e leitura offline."
	/>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:ital,opsz,wght@0,9..40,300..900;1,9..40,300..900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class={cn(currentTheme, 'min-h-screen bg-[var(--bg-primary)] transition-colors duration-300')}>
	{#if !isReader}
		<!--
			Lombada lateral (navegacao desktop): relevo de volume encadernado,
			carimbo Hanko, marcas de corte (Tonbo) e tategaki.
		-->
		<aside
			class="fixed top-0 left-0 z-50 hidden h-screen w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl xl:flex"
		>
			<div class="volume flex flex-1 flex-col justify-between px-7 pt-8 pb-6">
				<div>
					<!-- Header / Wordmark com estética de capa de revista japonesa -->
					<a href={resolve('/')} class="group mb-10 flex items-start gap-4">
						<div
							class="registration flex-1 border border-[var(--rule)] bg-[var(--bg-primary)] px-3.5 py-3 transition-colors group-hover:border-[var(--accent)]"
						>
							<div class="flex items-center justify-between">
								<span
									class="masthead block text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]"
									style="font-size:2.35rem"
								>
									Hiraku
								</span>
								<span class="hanko text-[0.5rem]">開く</span>
							</div>
							<span class="kicker mt-1 flex items-center justify-between">
								<span>Leitor de Mangá</span>
								<span class="tabular font-mono text-[var(--accent)]">第1巻</span>
							</span>
						</div>
						<span
							aria-hidden="true"
							class="tategaki pt-1 text-xs leading-none font-bold text-[var(--accent)] opacity-80 transition-opacity select-none group-hover:opacity-100"
						>
							ひらく・読書
						</span>
					</a>

					<!-- Menu Principal -->
					<nav aria-label="Navegação principal" class="flex flex-col">
						<div class="rule-double mb-2"></div>
						{#each NAV as item (item.route)}
							{@const active = isActive(item.route)}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={item.href}
								aria-current={active ? 'page' : undefined}
								class={cn(
									'group relative flex items-center justify-between border-b border-[var(--border)] py-4 text-[0.6875rem] font-extrabold tracking-[0.2em] uppercase transition-all',
									active
										? 'text-[var(--accent)]'
										: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
								)}
							>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
								<div class="flex items-center gap-3">
									<span
										aria-hidden="true"
										class={cn(
											'h-2 w-2 flex-shrink-0 transition-all duration-200',
											active
												? 'scale-100 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]'
												: 'scale-75 bg-[var(--rule)] group-hover:scale-100 group-hover:bg-[var(--text-secondary)]'
										)}
									></span>
									<item.icon
										class="h-4 w-4 transition-transform group-hover:scale-110"
										aria-hidden="true"
									/>
									<span>{item.label}</span>
								</div>

								<span
									class="text-[0.625rem] font-bold tracking-widest text-[var(--text-muted)] opacity-60 transition-opacity group-hover:opacity-100"
								>
									{item.kanji}
								</span>
							</a>
						{/each}
					</nav>
				</div>

				<!-- Rodapé da Lombada -->
				<div class="mt-auto pt-6">
					<div class="registration border border-[var(--border)] bg-[var(--bg-primary)] p-3">
						<div
							class="flex items-center justify-between text-[0.625rem] font-bold tracking-wider text-[var(--text-muted)] uppercase"
						>
							<span>Coleção</span>
							<span class="tabular text-[var(--accent)]">{mangaStore.library.length} vols</span>
						</div>
						<div
							class="mt-2 flex items-center justify-between font-mono text-[0.5625rem] tracking-widest text-[var(--text-muted)]/70"
						>
							<span>HIRAKU</span>
							<span>v1.2 // 2026</span>
						</div>
					</div>
				</div>
			</div>
		</aside>

		<!--
			Barra Inferior Mobile / Tablet (Bottom Dock):
			Design compacto com blur de vidro fosco, marcadores precisos de rota ativa e
			área de toque ergonômica com safe-area.
		-->
		<nav
			aria-label="Navegação principal"
			class="fixed bottom-0 left-0 z-100 flex w-full border-t border-[var(--rule)] bg-[var(--bg-secondary)]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_25px_rgba(0,0,0,0.5)] backdrop-blur-xl xl:hidden"
		>
			{#each NAV as item (item.route)}
				{@const active = isActive(item.route)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class={cn(
						'relative flex flex-1 flex-col items-center gap-1.5 py-3.5 text-[0.5625rem] font-extrabold tracking-[0.2em] uppercase transition-all',
						active
							? 'text-[var(--accent)]'
							: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
					)}
				>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{#if active}
						<span
							aria-hidden="true"
							class="absolute top-0 h-1 w-12 rounded-b-full bg-[var(--accent)] shadow-[0_2px_8px_var(--accent)]"
						></span>
					{/if}
					<item.icon
						class={cn('h-5 w-5 transition-transform', active ? 'scale-110' : '')}
						aria-hidden="true"
					/>
					<div class="flex items-center gap-1">
						<span>{item.label}</span>
					</div>
				</a>
			{/each}
		</nav>
	{/if}

	<!--
		Area de conteudo. O `xl:pl-64` sozinho apenas empurrava o conteudo para
		fora da lombada — sem respiro nenhum, o texto encostava na borda dela e
		parecia cortado. O padding lateral cresce com a tela e a folga inferior
		no mobile evita que o dock (fixo, ~4.5rem + safe-area) cubra o fim da
		lista; no leitor nada disso se aplica, a pagina ocupa a tela inteira.
	-->
	<div
		class={cn(
			!isReader &&
				'px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 xl:pt-8 xl:pr-10 xl:pb-10 xl:pl-[calc(16rem+2.5rem)]'
		)}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>
