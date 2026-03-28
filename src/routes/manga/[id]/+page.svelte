<script lang="ts">
	import { page } from '$app/state';
	import { mangaStore } from '$lib/stores/manga.svelte';
	import { ArrowLeft, BookOpen, Clock, Tag, ChevronRight, Play, Database } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	const id = $derived(page.params.id);
	const manga = $derived(mangaStore.library.find((m) => m.id === id));
</script>

{#if manga}
	<article class="min-h-screen pb-24 text-[var(--text-primary)] font-body">
		<!-- Hero Section -->
		<div class="relative h-[450px] overflow-hidden">
			<div 
				class="absolute inset-0 bg-cover bg-center blur-3xl opacity-20 scale-110"
				style="background-image: url({manga.coverUrl})"
			></div>
			<div class="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/80 to-transparent"></div>
			
			<div class="relative max-w-7xl mx-auto px-6 h-full flex items-end pb-12">
				<div class="flex flex-col md:flex-row gap-10 items-end w-full">
					<!-- Cover -->
					<div class="w-48 md:w-72 aspect-[3/4] card shadow-2xl flex-shrink-0 -mb-6 md:-mb-16 transform hover:scale-[1.02] transition-transform duration-500 rounded-xl overflow-hidden border border-[var(--border)]">
						<img src={manga.coverUrl} alt={manga.title} class="w-full h-full object-cover" />
					</div>
					
					<!-- Info -->
					<div class="flex-grow pb-4 md:pb-6">
						<div class="flex flex-wrap gap-2 mb-6">
							<span class="px-3 py-1 bg-[var(--accent)] text-[var(--accent-foreground)] text-[10px] font-bold uppercase tracking-[0.2em] rounded-md">Manga</span>
							<span class="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-[10px] uppercase tracking-[0.2em] rounded-md transition-colors">PDF Local</span>
						</div>
						<h1 class="text-4xl md:text-7xl mb-6 leading-[1.1] font-display font-black tracking-tight">{manga.title}</h1>
						<div class="flex flex-wrap items-center gap-8 text-[var(--text-secondary)] opacity-80">
							<div class="flex items-center gap-3">
								<Clock class="w-4 h-4 text-[var(--accent)]" />
								<span class="text-xs uppercase tracking-widest font-bold">Importado em {new Date(manga.addedAt).toLocaleDateString('pt-BR')}</span>
							</div>
							<div class="flex items-center gap-3">
								<BookOpen class="w-4 h-4 text-[var(--accent)]" />
								<span class="text-xs uppercase tracking-widest font-bold">{manga.totalPage} Páginas</span>
							</div>
						</div>
					</div>
					
					<!-- Main CTA -->
					<div class="pb-4 md:pb-6 flex-shrink-0">
						<a 
							href="/reader/{manga.id}" 
							class="btn-primary flex items-center gap-4 px-10 py-5 text-lg font-black shadow-[0_20px_40px_rgba(0,0,0,0.3)] rounded-2xl group"
						>
							<Play class="w-6 h-6 fill-current group-hover:scale-110 transition-transform" />
							{manga.progress > 0 ? 'CONTINUAR LENDO' : 'COMEÇAR LEITURA'}
						</a>
					</div>
				</div>
			</div>
		</div>

		<!-- Content -->
		<div class="max-w-7xl mx-auto px-6 mt-24 grid grid-cols-1 lg:grid-cols-3 gap-16">
			<!-- Main Column -->
			<div class="lg:col-span-2">
				<section class="mb-16">
					<h2 class="text-2xl mb-8 flex items-center gap-4 font-display font-bold">
						<div class="w-8 h-1 bg-[var(--accent)]"></div> SINOPSE
					</h2>
					<div class="prose prose-invert max-w-none text-[var(--text-primary)] leading-[1.8] text-lg opacity-90 font-body">
						{manga.description?.replace(/<[^>]*>?/gm, '') || 'Nenhuma descrição disponível via AniList.'}
					</div>
				</section>

				<section>
					<div class="flex items-center justify-between mb-10 border-b border-[var(--border)] pb-6">
						<h2 class="text-2xl font-display font-bold">ESTRUTURA</h2>
						<span class="text-[var(--text-muted)] text-[10px] uppercase tracking-[0.3em] font-bold">Capítulos Encontrados</span>
					</div>
					
					<div class="flex flex-col gap-3">
						{#if manga.bookmarks && manga.bookmarks.length > 0}
							{#each manga.bookmarks as chapter, i}
								<a 
									href="/reader/{manga.id}?page={chapter.pageNumber}"
									class="p-5 border border-[var(--border)] rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-between group cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--bg-accent)]/5 transition-all active:scale-[0.99]"
								>
									<div class="flex items-center gap-6">
										<span class="w-10 h-10 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] flex items-center justify-center text-xs font-black text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                      {String(i + 1).padStart(2, '0')}
                    </span>
										<div>
											<h4 class="font-bold text-base group-hover:text-[var(--accent)] transition-colors">{chapter.title}</h4>
											<p class="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mt-1.5 font-bold">Início na página {chapter.pageNumber}</p>
										</div>
									</div>
									<ChevronRight class="w-5 h-5 text-[var(--text-muted)] group-hover:translate-x-1 transition-transform" />
								</a>
							{/each}
						{:else}
							<div class="p-8 border-2 border-dashed border-[var(--border)] rounded-2xl flex flex-col items-center justify-center text-center opacity-40">
								<BookOpen class="w-8 h-8 mb-4" />
								<p class="text-sm font-bold uppercase tracking-widest">Nenhum capítulo detectado no PDF</p>
								<p class="text-xs mt-1">O arquivo será tratado como volume único.</p>
							</div>
						{/if}
					</div>
				</section>
			</div>

			<!-- Sidebar -->
			<aside class="flex flex-col gap-10">
				<section class="card p-8 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl">
					<h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] mb-6">Status de Leitura</h3>
					<div class="mb-4 flex justify-between items-end">
						<span class="text-3xl font-display font-black text-[var(--accent)]">{manga.progress}%</span>
						<span class="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">{manga.lastReadPage} / {manga.totalPage} pág.</span>
					</div>
					<div class="w-full h-3 bg-[var(--bg-primary)] rounded-full overflow-hidden border border-[var(--border)]">
						<div class="h-full bg-[var(--accent)] shadow-[0_0_15px_rgba(229,57,53,0.3)] transition-all duration-500" style="width: {manga.progress}%"></div>
					</div>
				</section>

				<section class="card p-8 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl">
					<h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] mb-6">Informações Técnicas</h3>
					<div class="flex flex-col gap-4">
						<div class="flex items-center gap-4 group">
							<div class="w-8 h-8 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center text-[var(--accent)] border border-[var(--border)]">
								<Tag class="w-4 h-4" />
							</div>
							<div>
								<p class="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-bold">Autor(a)</p>
								<p class="text-sm font-bold">{manga.author || 'Desconhecido'}</p>
							</div>
						</div>
						<div class="flex items-center gap-4">
							<div class="w-8 h-8 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center text-[var(--accent)] border border-[var(--border)]">
								<Database class="w-4 h-4" />
							</div>
							<div>
								<p class="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-bold">Fonte</p>
								<p class="text-sm font-bold truncate max-w-[150px]">{manga.filePath}</p>
							</div>
						</div>
					</div>
				</section>
			</aside>
		</div>
	</article>
{:else}
	<div class="min-h-screen flex flex-col items-center justify-center p-6 text-center text-[var(--text-primary)]">
		<h1 class="text-8xl font-black mb-4 text-[var(--accent)] opacity-20">404</h1>
		<p class="text-[var(--text-secondary)] mb-10 uppercase tracking-[0.4em] font-bold text-sm">Mangá não encontrado na coleção.</p>
		<a href="/" class="btn-primary flex items-center gap-3 px-8 py-4">
			<ArrowLeft class="w-5 h-5" /> VOLTAR PARA BIBLIOTECA
		</a>
	</div>
{/if}
