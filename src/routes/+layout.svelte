<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base, resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import { preferences } from '$lib/stores/preferences.svelte';
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
		{ route: '/', href: resolve('/'), label: 'Biblioteca', icon: Library },
		{ route: '/catalog', href: resolve('/catalog'), label: 'Catálogo', icon: Compass },
		{ route: '/settings', href: resolve('/settings'), label: 'Ajustes', icon: Settings }
	] as const;

	// A pagina do manga e do leitor pertencem ao ramo "catalogo/biblioteca"; sem
	// isso a navegacao apagava por completo ao entrar num titulo.
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
		content="Hiraku é um leitor de mangá auto-hospedado: biblioteca local, busca em fontes externas e leitura offline."
	/>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:ital,opsz,wght@0,9..40,300..900;1,9..40,300..900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class={cn(currentTheme, 'min-h-screen bg-[var(--bg-primary)]')}>
	{#if !isReader}
		<!--
			Lombada (desktop). Referencia direta ao volume encadernado: o wordmark
			corre na vertical como no lombo de um tankobon, e a navegacao fica
			apoiada numa regra dupla.
		-->
		<aside
			class="fixed top-0 left-0 z-50 hidden h-screen w-60 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] xl:flex"
		>
			<div class="flex flex-1 flex-col px-7 pt-8 pb-6">
				<a href={resolve('/')} class="mb-10 flex items-start gap-4">
					<div class="registration flex-1 border border-[var(--rule)] px-3 py-3">
						<span class="masthead block text-[var(--text-primary)]" style="font-size:2.25rem">
							Hiraku
						</span>
						<span class="kicker mt-1 block">Leitor de mangá</span>
					</div>
					<span
						aria-hidden="true"
						class="tategaki pt-1 text-xs leading-none text-[var(--accent)] select-none"
					>
						ひらく
					</span>
				</a>

				<nav aria-label="Navegação principal" class="flex flex-1 flex-col">
					<div class="rule-double mb-1"></div>
					{#each NAV as item (item.route)}
						{@const active = isActive(item.route)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- item.href ja aplica resolve() -->
						<a
							href={item.href}
							aria-current={active ? 'page' : undefined}
							class={cn(
								'group relative flex items-center gap-3 border-b border-[var(--border)] py-3.5 text-[0.6875rem] font-bold tracking-[0.18em] uppercase transition-colors',
								active
									? 'text-[var(--accent)]'
									: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
							)}
						>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
							<!-- Marcador solido em vez de fundo pintado: le melhor nos 3 temas. -->
							<span
								aria-hidden="true"
								class={cn(
									'h-2.5 w-2.5 flex-shrink-0 transition-colors',
									active
										? 'bg-[var(--accent)]'
										: 'bg-[var(--rule)] group-hover:bg-[var(--text-muted)]'
								)}
							></span>
							<item.icon class="h-4 w-4" aria-hidden="true" />
							{item.label}
						</a>
					{/each}
				</nav>

				<p class="kicker mt-6">Local · v1.1</p>
			</div>
		</aside>

		<!--
			Barra inferior (mobile/tablet). Largura total com regra superior, rotulos
			sempre visiveis e respeito a safe-area — a pilula flutuante anterior
			escondia conteudo e nao dizia o nome de cada destino.
		-->
		<nav
			aria-label="Navegação principal"
			class="fixed bottom-0 left-0 z-100 flex w-full border-t border-[var(--rule)] bg-[var(--bg-secondary)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg xl:hidden"
		>
			{#each NAV as item (item.route)}
				{@const active = isActive(item.route)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- item.href ja aplica resolve() -->
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class={cn(
						'relative flex flex-1 flex-col items-center gap-1.5 py-3 text-[0.5625rem] font-bold tracking-[0.2em] uppercase transition-colors',
						active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
					)}
				>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{#if active}
						<span aria-hidden="true" class="absolute top-0 h-0.5 w-10 bg-[var(--accent)]"></span>
					{/if}
					<item.icon class="h-5 w-5" aria-hidden="true" />
					{item.label}
				</a>
			{/each}
		</nav>
	{/if}

	<div class={cn(!isReader && 'xl:pl-60')}>
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>
