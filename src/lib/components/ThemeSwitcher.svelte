<script lang="ts">
  import { onMount } from 'svelte';
  import { cn } from '$lib/utils';
  import { Palette, Check } from 'lucide-svelte';

  const themes = [
    { id: 'theme-ink', name: 'Ink', color: '#0a0a0a', border: '#e53935' },
    { id: 'theme-neon', name: 'Neon', color: '#050b1a', border: '#8b5cf6' },
    { id: 'theme-paper', name: 'Paper', color: '#fcfcf7', border: '#b03030' },
  ];

  let currentTheme = $state('theme-ink');

  onMount(() => {
    const saved = localStorage.getItem('mangaflow-theme');
    if (saved) currentTheme = saved;
  });

  function setTheme(id: string) {
    currentTheme = id;
    localStorage.setItem('mangaflow-theme', id);
    window.location.reload();
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap gap-4">
    {#each themes as theme}
      <div 
        class={cn(
          "w-24 p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2",
          currentTheme === theme.id ? "border-[var(--accent)]" : "border-transparent bg-[var(--bg-secondary)]"
        )}
        onclick={() => setTheme(theme.id)}
      >
        <div 
          class="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center"
          style="background-color: {theme.color}"
        >
          {#if currentTheme === theme.id}
            <Check class="w-6 h-6" style="color: {theme.border}" />
          {/if}
        </div>
        <span class="text-xs font-bold uppercase tracking-wider">{theme.name}</span>
      </div>
    {/each}
  </div>
</div>
