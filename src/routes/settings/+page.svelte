<script lang="ts">
  import { ArrowLeft, Palette, Database, Shield, Globe, BarChart2, Download, Upload } from 'lucide-svelte';
  import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
  import { mangaStore } from '$lib/stores/manga.svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';

  let confirmClear = $state(false);

  const stats = $derived({
    total: mangaStore.library.length,
    totalPages: mangaStore.library.reduce((s, m) => s + (m.totalPage || 0), 0),
    pagesRead: mangaStore.library.reduce((s, m) => s + (m.lastReadPage || 0), 0),
    completed: mangaStore.library.filter((m) => m.progress >= 100).length,
    reading: mangaStore.library.filter((m) => m.progress > 0 && m.progress < 100).length,
  });

  let importFeedback = $state<{ ok: boolean; message: string } | null>(null);

  function handleExport() {
    const json = mangaStore.exportLibrary();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hiraku-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = mangaStore.importLibrary(ev.target?.result as string);
      importFeedback = result.ok
        ? { ok: true, message: `${result.count} mangá(s) importado(s) com sucesso.` }
        : { ok: false, message: result.error ?? 'Erro desconhecido.' };
      setTimeout(() => (importFeedback = null), 5000);
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = '';
  }

  function handleClearAll() {
    if (!confirmClear) {
      confirmClear = true;
      setTimeout(() => (confirmClear = false), 4000);
      return;
    }
    mangaStore.clearAll();
    confirmClear = false;
    goto(`${base}/`);
  }
</script>

<main class="max-w-4xl mx-auto px-6 py-12 pb-24 text-[var(--text-primary)]">
  <header class="flex items-center gap-4 mb-12">
    <a href="{base}/" class="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors">
      <ArrowLeft class="w-6 h-6" />
    </a>
    <h1 class="text-4xl text-[var(--accent)] font-display font-bold">Configurações</h1>
  </header>

  <div class="flex flex-col gap-12">
    <!-- Stats Section -->
    <section>
      <div class="flex items-center gap-3 mb-6">
        <BarChart2 class="w-6 h-6 text-[var(--accent)]" />
        <h2 class="text-xl font-bold border-b border-[var(--border)] flex-grow pb-1 font-display">Estatísticas</h2>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="card p-5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius)] text-center">
          <p class="text-3xl font-black text-[var(--accent)] font-display">{stats.total}</p>
          <p class="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1 font-body">Mangás</p>
        </div>
        <div class="card p-5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius)] text-center">
          <p class="text-3xl font-black text-[var(--accent)] font-display">{stats.pagesRead.toLocaleString('pt-BR')}</p>
          <p class="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1 font-body">Pág. Lidas</p>
        </div>
        <div class="card p-5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius)] text-center">
          <p class="text-3xl font-black text-[var(--accent)] font-display">{stats.reading}</p>
          <p class="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1 font-body">Em Andamento</p>
        </div>
        <div class="card p-5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius)] text-center">
          <p class="text-3xl font-black text-[var(--accent)] font-display">{stats.completed}</p>
          <p class="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1 font-body">Concluídos</p>
        </div>
      </div>
    </section>

    <!-- Appearance Section -->
    <section>
      <div class="flex items-center gap-3 mb-6">
        <Palette class="w-6 h-6 text-[var(--accent)]" />
        <h2 class="text-xl font-bold border-b border-[var(--border)] flex-grow pb-1 font-display">Aparência</h2>
      </div>
      <p class="text-[var(--text-secondary)] mb-6 -mt-4 text-sm font-body">Personalize as cores e o estilo do seu leitor.</p>
      
      <ThemeSwitcher />
    </section>

    <!-- Backup Section -->
    <section>
      <div class="flex items-center gap-3 mb-6">
        <Download class="w-6 h-6 text-[var(--accent)]" />
        <h2 class="text-xl font-bold border-b border-[var(--border)] flex-grow pb-1 font-display">Backup</h2>
      </div>
      <p class="text-[var(--text-secondary)] mb-6 -mt-4 text-sm font-body">Exporte ou importe sua biblioteca em JSON. Os arquivos PDF não são incluídos — apenas o progresso e os metadados.</p>

      {#if importFeedback}
        <div class={[
          'mb-4 p-4 rounded-[var(--radius)] text-sm font-body border',
          importFeedback.ok
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        ].join(' ')}>
          {importFeedback.message}
        </div>
      {/if}

      <div class="flex flex-col sm:flex-row gap-4">
        <button
          onclick={handleExport}
          disabled={mangaStore.library.length === 0}
          class="flex-1 flex items-center justify-center gap-3 px-5 py-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/50 transition-all text-sm font-bold uppercase tracking-widest font-body disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Download class="w-4 h-4" />
          Exportar Biblioteca
        </button>

        <label class="flex-1 flex items-center justify-center gap-3 px-5 py-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/50 transition-all text-sm font-bold uppercase tracking-widest font-body cursor-pointer">
          <Upload class="w-4 h-4" />
          Importar Backup
          <input type="file" accept="application/json,.json" class="hidden" onchange={handleImport} />
        </label>
      </div>
    </section>

    <!-- Storage Section -->
    <section>
      <div class="flex items-center gap-3 mb-6">
        <Database class="w-6 h-6 text-[var(--accent)]" />
        <h2 class="text-xl font-bold border-b border-[var(--border)] flex-grow pb-1 font-display">Armazenamento</h2>
      </div>
      <p class="text-[var(--text-secondary)] mb-6 -mt-4 text-sm font-body">Dados salvos localmente no seu dispositivo.</p>

      <div class="card p-6 flex items-center justify-between border border-[var(--border)] bg-[var(--bg-secondary)] rounded-[var(--radius)]">
        <div>
          <h4 class="font-bold mb-1 font-body">Limpar Biblioteca</h4>
          <p class="text-xs text-[var(--text-muted)] font-body">
            {mangaStore.library.length} mangá{mangaStore.library.length !== 1 ? 's' : ''} na biblioteca.
            {confirmClear ? 'Clique novamente para confirmar.' : 'Remove todos os mangás e o progresso.'}
          </p>
        </div>
        <button
          onclick={handleClearAll}
          disabled={mangaStore.library.length === 0}
          class={[
            'px-4 py-2 rounded-[var(--radius)] text-sm font-bold uppercase transition-all',
            confirmClear
              ? 'bg-red-500 text-white animate-pulse'
              : 'border border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed'
          ].join(' ')}
        >
          {confirmClear ? 'CONFIRMAR' : 'LIMPAR TUDO'}
        </button>
      </div>
    </section>

    <!-- Privacy Section -->
    <section>
      <div class="flex items-center gap-3 mb-6">
        <Shield class="w-6 h-6 text-[var(--accent)]" />
        <h2 class="text-xl font-bold border-b border-[var(--border)] flex-grow pb-1 font-display">Privacidade</h2>
      </div>
      <div class="card p-6 bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-[var(--radius)]">
        <p class="text-sm leading-relaxed font-body">
          O <strong class="text-[var(--accent)]">Hiraku</strong> é uma aplicação 100% estática. Seus arquivos PDF não saem do seu computador e seu progresso de leitura fica salvo apenas no seu navegador. Não coletamos dados de uso.
        </p>
      </div>
    </section>

    <footer class="mt-12 flex items-center justify-center gap-6 text-[var(--text-muted)] text-sm italic font-body">
      <div class="flex items-center gap-2">
        <Globe class="w-4 h-4" /> v1.1
      </div>
      <span>•</span>
      <span>Orgulhosamente construído com Svelte 5</span>
    </footer>
  </div>
</main>
