<script lang="ts">
    import { page } from '$app/state';
    import { base } from '$app/paths';
    import { mangaStore } from '$lib/stores/manga.svelte';
    import { PDFService } from '$lib/services/pdf';
    import { PersistenceService } from '$lib/services/persistence';
    import { ArrowLeft, Plus, BookOpen, Play, Star, Clock, FileUp } from 'lucide-svelte';

    const seriesId = $derived(page.params.id);
    const series = $derived(mangaStore.getSeries(seriesId));

    let isAddingVolume = $state(false);
    let addError = $state<string | null>(null);

    async function handleAddVolume() {
        if (!series) return;
        isAddingVolume = true;
        addError = null;
        try {
            const [handle] = await (window as any).showOpenFilePicker({
                types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
            });
            const file = await handle.getFile();
            const doc = await PDFService.loadDocument(file);
            const meta = await PDFService.getMetadata(doc);
            const cover = await PDFService.getPageAsImage(doc, 1, 0.2);

            const nextVolume = (series.volumes.at(-1)?.volumeNumber ?? 0) + 1;

            const newManga = {
                id: crypto.randomUUID(),
                title: `${series.title} - Volume ${nextVolume}`,
                author: series.author,
                coverUrl: cover,
                description: series.description,
                genres: series.genres,
                status: series.status,
                averageScore: series.averageScore,
                seriesId: series.id,
                volumeNumber: nextVolume,
                progress: 0,
                lastReadPage: 1,
                totalPage: meta.pageCount,
                filePath: file.name,
                addedAt: new Date().toISOString(),
                bookmarks: meta.bookmarks,
                hasHandle: true
            };

            await mangaStore.addVolumeToSeries(newManga, handle);
        } catch (e: any) {
            if (e?.name !== 'AbortError') addError = 'Erro ao importar volume.';
        } finally {
            isAddingVolume = false;
        }
    }

    function statusLabel(s?: string) {
        const map: Record<string, string> = {
            FINISHED: 'Finalizado', RELEASING: 'Em lançamento',
            HIATUS: 'Hiato', NOT_YET_RELEASED: 'Não lançado'
        };
        return s ? (map[s] ?? s) : '';
    }

    /** Next unfinished volume to read */
    const nextVolume = $derived(
        series?.volumes.find(v => v.progress < 100) ?? series?.volumes[0]
    );
</script>

{#if series}
    <!-- Hero -->
    <div class="relative min-h-[380px] overflow-hidden">
        <div
            class="absolute inset-0 bg-cover bg-center blur-3xl opacity-20 scale-110"
            style="background-image: url({series.volumes[0]?.coverUrl})"
        ></div>
        <div class="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/70 to-transparent"></div>

        <div class="relative max-w-7xl mx-auto px-6 pt-8 pb-12 flex items-end h-full min-h-[380px]">
            <div class="flex flex-col md:flex-row gap-10 items-end w-full">
                <!-- Cover stack -->
                <div class="relative w-44 flex-shrink-0">
                    {#each series.volumes.slice(0, 3).reverse() as vol, i}
                        <div
                            class="absolute w-full aspect-[3/4] rounded-xl overflow-hidden border border-[var(--border)] shadow-2xl"
                            style="transform: rotate({(i - 1) * 3}deg) translateY({-i * 4}px);"
                        >
                            {#if vol.coverUrl}
                                <img src={vol.coverUrl} alt={vol.title} class="w-full h-full object-cover" />
                            {/if}
                        </div>
                    {/each}
                    <div class="w-full aspect-[3/4] opacity-0"></div>
                </div>

                <!-- Info -->
                <div class="flex-grow pb-4">
                    <div class="flex flex-wrap gap-2 mb-4">
                        <span class="px-3 py-1 bg-[var(--accent)] text-[var(--accent-foreground)] text-[10px] font-bold uppercase tracking-[0.2em] rounded-md">Série</span>
                        <span class="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-[10px] uppercase tracking-[0.2em] rounded-md">{series.volumes.length} {series.volumes.length === 1 ? 'Volume' : 'Volumes'}</span>
                        {#if series.status}
                            <span class="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-[10px] uppercase tracking-[0.2em] rounded-md">{statusLabel(series.status)}</span>
                        {/if}
                    </div>
                    <h1 class="text-4xl md:text-6xl mb-4 leading-tight font-display font-black tracking-tight">{series.title}</h1>
                    <div class="flex flex-wrap items-center gap-6 text-[var(--text-secondary)] opacity-80">
                        {#if series.author}
                            <span class="text-xs uppercase tracking-widest font-bold">{series.author}</span>
                        {/if}
                        {#if series.averageScore}
                            <span class="flex items-center gap-1.5 text-xs font-bold">
                                <Star class="w-3.5 h-3.5 text-[var(--accent)]" />
                                {series.averageScore}/100
                            </span>
                        {/if}
                    </div>
                </div>

                <!-- Actions -->
                <div class="pb-4 flex-shrink-0 flex flex-col gap-3">
                    {#if nextVolume}
                        <a
                            href="{base}/reader/{nextVolume.id}"
                            class="btn-primary flex items-center gap-4 px-8 py-4 text-base font-black shadow-2xl rounded-2xl group"
                        >
                            <Play class="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
                            {nextVolume.progress > 0 ? 'CONTINUAR' : 'COMEÇAR LEITURA'}
                        </a>
                    {/if}
                    <button
                        onclick={handleAddVolume}
                        disabled={isAddingVolume}
                        class="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all text-sm font-bold disabled:opacity-50"
                    >
                        {#if isAddingVolume}
                            Importando...
                        {:else}
                            <Plus class="w-4 h-4" /> Adicionar Volume
                        {/if}
                    </button>
                    {#if addError}
                        <p class="text-xs text-red-500 text-center">{addError}</p>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <!-- Content -->
    <div class="max-w-7xl mx-auto px-6 pt-4 pb-8">
        <a href="{base}/" class="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-xs font-bold uppercase tracking-widest mb-8">
            <ArrowLeft class="w-4 h-4" /> Biblioteca
        </a>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <!-- Volume list -->
            <div class="lg:col-span-2">
                <div class="flex items-center justify-between mb-6 border-b border-[var(--border)] pb-4">
                    <h2 class="text-xl font-display font-bold">VOLUMES</h2>
                    <span class="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">{series.volumes.length} no total</span>
                </div>
                <div class="flex flex-col gap-3">
                    {#each series.volumes as vol}
                        <a
                            href="{base}/reader/{vol.id}"
                            class="flex items-center gap-5 p-4 border border-[var(--border)] rounded-2xl bg-[var(--bg-secondary)] hover:border-[var(--accent)] hover:bg-[var(--bg-accent)]/5 transition-all group"
                        >
                            <div class="w-12 h-16 rounded-lg overflow-hidden border border-[var(--border)] flex-shrink-0">
                                {#if vol.coverUrl}
                                    <img src={vol.coverUrl} alt={vol.title} class="w-full h-full object-cover" />
                                {:else}
                                    <div class="w-full h-full bg-[var(--bg-primary)] flex items-center justify-center">
                                        <BookOpen class="w-5 h-5 text-[var(--text-muted)]" />
                                    </div>
                                {/if}
                            </div>
                            <div class="flex-grow min-w-0">
                                <p class="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest mb-0.5">Volume {vol.volumeNumber}</p>
                                <h4 class="font-bold text-sm group-hover:text-[var(--accent)] transition-colors truncate">{vol.title}</h4>
                                <p class="text-[10px] text-[var(--text-muted)] mt-1">{vol.totalPage} páginas</p>
                            </div>
                            <div class="flex-shrink-0 text-right">
                                {#if vol.progress >= 100}
                                    <span class="text-[9px] font-bold text-green-500 uppercase tracking-widest">Concluído</span>
                                {:else if vol.progress > 0}
                                    <div class="flex flex-col items-end gap-1">
                                        <span class="text-[10px] font-bold text-[var(--accent)]">{vol.progress}%</span>
                                        <div class="w-16 h-1 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                                            <div class="h-full bg-[var(--accent)]" style="width:{vol.progress}%"></div>
                                        </div>
                                    </div>
                                {:else}
                                    <span class="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">Não iniciado</span>
                                {/if}
                            </div>
                        </a>
                    {/each}
                </div>
            </div>

            <!-- Sidebar -->
            <aside class="flex flex-col gap-6">
                {#if series.description}
                    <section class="card p-6 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl">
                        <h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] mb-4">Sinopse</h3>
                        <p class="text-sm text-[var(--text-primary)] leading-relaxed opacity-90">
                            {series.description.replace(/<[^>]*>/gm, '').slice(0, 300)}{series.description.length > 300 ? '…' : ''}
                        </p>
                    </section>
                {/if}
                {#if series.genres && series.genres.length > 0}
                    <section class="card p-6 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl">
                        <h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] mb-4">Gêneros</h3>
                        <div class="flex flex-wrap gap-2">
                            {#each series.genres as genre}
                                <span class="text-[9px] px-2.5 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full uppercase tracking-widest">{genre}</span>
                            {/each}
                        </div>
                    </section>
                {/if}
                <section class="card p-6 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl">
                    <h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] mb-4">Progresso da Série</h3>
                    <div class="mb-3 flex justify-between items-end">
                        <span class="text-2xl font-display font-black text-[var(--accent)]">{Math.round(series.volumes.reduce((s, v) => s + v.progress, 0) / series.volumes.length)}%</span>
                        <span class="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest">{series.volumes.filter(v => v.progress >= 100).length}/{series.volumes.length} concluídos</span>
                    </div>
                    <div class="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                        <div class="h-full bg-[var(--accent)] transition-all duration-500" style="width:{Math.round(series.volumes.reduce((s, v) => s + v.progress, 0) / series.volumes.length)}%"></div>
                    </div>
                </section>
            </aside>
        </div>
    </div>
{:else}
    <div class="min-h-screen flex flex-col items-center justify-center p-6 text-center text-[var(--text-primary)]">
        <h1 class="text-8xl font-black mb-4 text-[var(--accent)] opacity-20">404</h1>
        <p class="text-[var(--text-secondary)] mb-10 uppercase tracking-[0.4em] font-bold text-sm">Série não encontrada.</p>
        <a href="{base}/" class="btn-primary flex items-center gap-3 px-8 py-4">
            <ArrowLeft class="w-5 h-5" /> VOLTAR PARA BIBLIOTECA
        </a>
    </div>
{/if}
