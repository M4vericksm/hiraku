<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base, resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import { Settings, Library, BookOpen, Compass } from 'lucide-svelte';

	let { children } = $props();
	let currentTheme = $state('theme-ink');

	onMount(() => {
		const savedTheme = localStorage.getItem('hiraku-theme');
		if (savedTheme) currentTheme = savedTheme;

		if ('serviceWorker' in navigator) {
			const swUrl = `${base}/sw.js`;
			void navigator.serviceWorker.register(swUrl);
		}
	});

	const isReader = $derived(page.route.id?.startsWith('/reader'));

	function navLink(route: string) {
		const active = page.route.id === route;
		return cn(
			'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all',
			active
				? 'bg-[var(--accent)]/10 text-[var(--accent)]'
				: 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]'
		);
	}
</script>

<svelte:head>
	<title>Hiraku</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=DM+Mono&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Syne:wght@400..800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class={cn(currentTheme, 'min-h-screen bg-[var(--bg-primary)] transition-colors duration-500')}>
	{#if !isReader}
		<!-- Sidebar desktop -->
		<aside
			class="fixed top-0 left-0 z-50 hidden h-screen w-56 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] p-6 md:flex"
		>
			<div class="mb-10">
				<div class="mb-1 flex items-center gap-2">
					<BookOpen class="h-5 w-5 text-[var(--accent)]" />
					<h1 class="font-display text-xl font-black text-[var(--text-primary)]">Hiraku</h1>
				</div>
				<p class="pl-7 text-[9px] tracking-widest text-[var(--text-muted)] uppercase">
					Biblioteca local
				</p>
			</div>
			<nav class="flex flex-grow flex-col gap-1">
				<a href={resolve('/')} class={navLink('/')}>
					<Library class="h-5 w-5" />
					Biblioteca
				</a>
				<a href={resolve('/catalog')} class={navLink('/catalog')}>
					<Compass class="h-5 w-5" />
					Catálogo
				</a>
				<a href={resolve('/settings')} class={navLink('/settings')}>
					<Settings class="h-5 w-5" />
					Configurações
				</a>
			</nav>
			<p class="text-[9px] tracking-widest text-[var(--text-muted)] uppercase opacity-40">v1.1</p>
		</aside>

		<!-- Pill nav mobile -->
		<nav
			class="animate-in slide-in-from-bottom-10 fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-12 rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]/80 px-8 py-4 shadow-2xl backdrop-blur-xl duration-700 md:hidden"
		>
			<a
				href={resolve('/')}
				class={cn(
					'p-2 transition-all hover:scale-110',
					page.route.id === '/' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
				)}
			>
				<Library class="h-7 w-7" />
			</a>
			<a
				href={resolve('/catalog')}
				class={cn(
					'p-2 transition-all hover:scale-110',
					page.route.id === '/catalog' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
				)}
			>
				<Compass class="h-7 w-7" />
			</a>
			<a
				href={resolve('/settings')}
				class={cn(
					'p-2 transition-all hover:scale-110',
					page.route.id === '/settings' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
				)}
			>
				<Settings class="h-7 w-7" />
			</a>
		</nav>
	{/if}

	<div class={cn(!isReader && 'md:pl-56')}>
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	:global(.font-display) {
		font-family: 'Syne', sans-serif;
	}
	:global(.font-body) {
		font-family: 'DM Sans', sans-serif;
	}
	:global(.font-mono) {
		font-family: 'DM Mono', monospace;
	}
</style>
