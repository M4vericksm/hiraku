<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
  import { Settings, Library } from 'lucide-svelte';

  let { children } = $props();
  let currentTheme = $state('theme-ink');

  onMount(() => {
    const savedTheme = localStorage.getItem('hiraku-theme');
    if (savedTheme) {
      currentTheme = savedTheme;
    }
  });

  const isReader = $derived(page.route.id?.startsWith('/reader'));
</script>

<svelte:head>
  <title>Hiraku</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Syne:wght@400..800&display=swap" rel="stylesheet">
</svelte:head>

<div class={cn(currentTheme, "min-h-screen bg-[var(--bg-primary)] transition-colors duration-500 overflow-x-hidden")}>
  {#if !isReader}
    <nav class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-[var(--bg-secondary)]/80 backdrop-blur-xl border border-[var(--border)] px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-12 animate-in slide-in-from-bottom-10 duration-700">
      <a href="{base}/" class={cn("p-2 transition-all hover:scale-110", page.route.id === '/' ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
        <Library class="w-7 h-7" />
      </a>
      <a href="{base}/settings" class={cn("p-2 transition-all hover:scale-110", page.route.id === '/settings' ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
        <Settings class="w-7 h-7" />
      </a>
    </nav>
  {/if}

  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  :global(.font-display) { font-family: 'Syne', sans-serif; }
  :global(.font-body) { font-family: 'DM Sans', sans-serif; }
  :global(.font-mono) { font-family: 'DM Mono', monospace; }
</style>
