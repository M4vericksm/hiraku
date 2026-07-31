<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils';
	import { Check } from 'lucide-svelte';

	const themes = [
		{ id: 'theme-ink', name: 'Ink', color: '#0a0a0a', border: '#e53935' },
		{ id: 'theme-neon', name: 'Neon', color: '#050b1a', border: '#8b5cf6' },
		{ id: 'theme-paper', name: 'Paper', color: '#fcfcf7', border: '#b03030' }
	];

	let currentTheme = $state('theme-ink');

	onMount(() => {
		const saved = localStorage.getItem('hiraku-theme');
		if (saved) currentTheme = saved;
	});

	function setTheme(id: string) {
		currentTheme = id;
		localStorage.setItem('hiraku-theme', id);
		window.location.reload();
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap gap-4">
		{#each themes as theme (theme.id)}
			<button
				type="button"
				class={cn(
					'flex w-24 cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all',
					currentTheme === theme.id
						? 'border-[var(--accent)]'
						: 'border-transparent bg-[var(--bg-secondary)]'
				)}
				onclick={() => setTheme(theme.id)}
			>
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full border border-white/10"
					style="background-color: {theme.color}"
				>
					{#if currentTheme === theme.id}
						<Check class="h-6 w-6" style="color: {theme.border}" />
					{/if}
				</div>
				<span class="text-xs font-bold tracking-wider uppercase">{theme.name}</span>
			</button>
		{/each}
	</div>
</div>
