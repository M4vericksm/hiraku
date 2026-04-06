<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
  import { Settings, Library, BookOpen } from 'lucide-svelte';

  let { children } = $props();
  let currentTheme = $state('theme-ink');

  onMount(() => {
    const savedTheme = localStorage.getItem('hiraku-theme');
    if (savedTheme) currentTheme = savedTheme;
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Syne:wght@400..800&display=swap" rel="stylesheet">
</svelte:head>

<div class={cn(currentTheme, "min-h-screen bg-[var(--bg-primary)] transition-colors duration-500")}>
  {#if !isReader}
    <!-- Sidebar desktop -->
    <aside class="hidden md:flex flex-col fixed left-0 top-0 h-screen w-56 bg-[var(--bg-secondary)] border-r border-[var(--border)] z-50 p-6">
      <div class="mb-10">
        <div class="flex items-center gap-2 mb-1">
          <BookOpen class="w-5 h-5 text-[var(--accent)]" />
          <h1 class="text-xl font-display font-black text-[var(--text-primary)]">Hiraku</h1>
        </div>
        <p class="text-[9px] text-[var(--text-muted)] uppercase tracking-widest pl-7">Biblioteca local</p>
      </div>
      <nav class="flex flex-col gap-1 flex-grow">
        <a href="{base}/" class={navLink('/')}>
          <Library class="w-5 h-5" />
          Biblioteca
        </a>
        <a href="{base}/settings" class={navLink('/settings')}>
          <Settings class="w-5 h-5" />
          Configurações
        </a>
      </nav>
      <p class="text-[9px] text-[var(--text-muted)] opacity-40 uppercase tracking-widest">v1.1</p>
    </aside>

    <!-- Pill nav mobile -->
    <nav class="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-[var(--bg-secondary)]/80 backdrop-blur-xl border border-[var(--border)] px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-12 animate-in slide-in-from-bottom-10 duration-700">
      <a href="{base}/" class={cn("p-2 transition-all hover:scale-110", page.route.id === '/' ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
        <Library class="w-7 h-7" />
      </a>
      <a href="{base}/settings" class={cn("p-2 transition-all hover:scale-110", page.route.id === '/settings' ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
        <Settings class="w-7 h-7" />
      </a>
    </nav>
  {/if}

  <div class={cn(!isReader && "md:pl-56")}>
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  :global(.font-display) { font-family: 'Syne', sans-serif; }
  :global(.font-body) { font-family: 'DM Sans', sans-serif; }
  :global(.font-mono) { font-family: 'DM Mono', monospace; }
</style>
