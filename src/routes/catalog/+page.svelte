<script lang="ts">
	import VolumeCard from '$lib/components/VolumeCard.svelte';
	import VolumeGridSkeleton from '$lib/components/VolumeGridSkeleton.svelte';
	import { AlertTriangle } from 'lucide-svelte';
	import type { Manga } from '$lib/stores/manga.svelte';
	import { ApiError, BackendApiService, isAborted } from '$lib/services/api';
	import { onDestroy } from 'svelte';

	// Obras Principais Canônicas para Exibição Inicial no Catálogo com IDs reais
	const featuredMangas: Manga[] = [
		{
			id: '801513ba-a712-498c-8f57-cae55b38cc92',
			source: 'mangadex',
			title: 'Berserk',
			author: 'Kentarou Miura',
			coverUrl:
				'https://uploads.mangadex.org/covers/801513ba-a712-498c-8f57-cae55b38cc92/81e1c82d-6672-400c-8c58-4ff9bfb89031.jpg.256.jpg',
			description:
				'Guts, um ex-mercenário agora conhecido como o Espadachim Negro, busca vingança contra as forças demoníacas.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['seinen', 'action', 'supernatural', 'drama', 'horror']
		},
		{
			id: 'a1c7c817-4e59-43b7-9365-09675a149a6f',
			source: 'mangadex',
			title: 'One Piece',
			author: 'Eiichiro Oda',
			coverUrl:
				'https://uploads.mangadex.org/covers/a1c7c817-4e59-43b7-9365-09675a149a6f/2f4aca53-64c7-46ac-ae85-3bc9b3169890.png.256.jpg',
			description:
				'Monkey D. Luffy se recusa a deixar qualquer um ficar em seu caminho para se tornar o Rei dos Piratas.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'adventure', 'fantasy', 'comedy']
		},
		{
			id: 'a77742b1-befd-49a4-bff5-1ad4e6b0ef7b',
			source: 'mangadex',
			title: 'Chainsaw Man',
			author: 'Tatsuki Fujimoto',
			coverUrl:
				'https://uploads.mangadex.org/covers/a77742b1-befd-49a4-bff5-1ad4e6b0ef7b/6e518bd1-5f60-446b-8832-bfe6bf74834b.jpg.256.jpg',
			description:
				'Denji tinha um sonho simples: viver uma vida feliz e pacífica com sua parceira Pochita.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'supernatural', 'horror', 'demons']
		},
		{
			id: 'd1a9fdeb-f713-407f-960c-8326b586e6fd',
			source: 'mangadex',
			title: 'Vagabond',
			author: 'Takehiko Inoue',
			coverUrl:
				'https://uploads.mangadex.org/covers/d1a9fdeb-f713-407f-960c-8326b586e6fd/05f8dcb4-8ea1-48db-a0b1-3a8fbf695e5a.jpg.256.jpg',
			description:
				'No Japão do século XVI, Shinmen Takezou é um jovem selvagem e agressivo que se tornará o lendário Miyamoto Musashi.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['seinen', 'action', 'historical', 'drama', 'martial-arts']
		},
		{
			id: '5d1fc77e-706a-4fc5-bea8-486c9be0145d',
			source: 'mangadex',
			title: 'Vinland Saga',
			author: 'Makoto Yukimura',
			coverUrl:
				'https://uploads.mangadex.org/covers/5d1fc77e-706a-4fc5-bea8-486c9be0145d/7fa60f5d-285a-40c5-8a1d-9cf375eaf897.jpg.256.jpg',
			description:
				'Thorfinn, filho de um dos maiores guerreiros vikings, cresce entre mercenários jurando vingança.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['seinen', 'action', 'historical', 'adventure', 'drama']
		},
		{
			id: '4301d363-ee02-43f4-ae24-4cbf29a74830',
			source: 'mangadex',
			title: 'Oyasumi Punpun',
			author: 'Inio Asano',
			coverUrl:
				'https://uploads.mangadex.org/covers/4301d363-ee02-43f4-ae24-4cbf29a74830/0295431e-ccb9-4599-900f-0a1bc7380561.jpg.256.jpg',
			description:
				'Punpun Onodera é um garoto comum vivendo no Japão com sua visão do mundo em constante transformação.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['seinen', 'psychological', 'slice-of-life', 'drama']
		},
		{
			id: '6b1eb93e-473a-4ab3-9922-1a66d2a29a4a',
			source: 'mangadex',
			title: 'Naruto',
			author: 'Masashi Kishimoto',
			coverUrl:
				'https://uploads.mangadex.org/covers/6b1eb93e-473a-4ab3-9922-1a66d2a29a4a/c5a3090c-4ca0-40a2-9102-e0ee0c6dac15.jpg.256.jpg',
			description:
				'Naruto Uzumaki é um jovem ninja hiperativo que busca reconhecimento e sonha em se tornar Hokage.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'adventure', 'fantasy', 'martial-arts']
		},
		{
			id: 'solo-leveling',
			source: 'mangalivre',
			title: 'Solo Leveling',
			author: 'Chugong',
			// Sem host: `VolumeCard`/detalhe resolvem na hora de exibir, e o mesmo
			// valor pode ir para a estante sem congelar o backend de hoje.
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FSolo-Leveling-193x278.webp',
			description:
				'Conhecido como o caçador mais fraco de toda a humanidade, Sung Jin-Woo luta pela sobrevivência em masmorras mortais.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['action', 'adventure', 'fantasy']
		}
	];

	let searchQuery = $state('');
	let isSearching = $state(false);
	let searchError = $state<string | null>(null);
	let results = $state<Manga[]>(featuredMangas);

	/**
	 * Cancela a busca anterior quando uma nova comeca. Sem isso, duas buscas em
	 * voo podiam terminar fora de ordem e a mais antiga sobrescrevia a mais
	 * recente na tela.
	 */
	let inFlight: AbortController | null = null;

	onDestroy(() => inFlight?.abort());

	async function handleSearch(e?: SubmitEvent) {
		if (e) e.preventDefault();
		const query = searchQuery.trim();

		inFlight?.abort();

		if (!query) {
			inFlight = null;
			searchError = null;
			results = featuredMangas;
			return;
		}

		const controller = new AbortController();
		inFlight = controller;

		isSearching = true;
		searchError = null;
		try {
			// Sem filtro de fonte: o backend agrega todas e ja intercala por fonte.
			const data = await BackendApiService.search(query, undefined, controller.signal);
			results = data.map((item) => ({
				id: item.source_id,
				source: item.source,
				title: item.title,
				author: item.alt_titles?.[0] || '',
				coverUrl: item.cover_url,
				description: item.description,
				progress: 0,
				lastReadPage: 0,
				totalPage: 0,
				addedAt: new Date().toISOString(),
				genres: item.genres || []
			}));
		} catch (err) {
			// Cancelamento e decisao nossa, nao falha: a busca seguinte manda.
			if (isAborted(err)) return;
			console.error('Falha ao buscar mangás:', err);
			searchError =
				err instanceof ApiError ? err.message : 'Não foi possível buscar. Tente de novo.';
			results = [];
		} finally {
			if (inFlight === controller) {
				inFlight = null;
				isSearching = false;
			}
		}
	}
</script>

<svelte:head>
	<title>Catálogo • Hiraku</title>
</svelte:head>

<div class="space-y-8">
	<!-- Cabeçalho Limpo e Direto -->
	<header class="border-b border-[var(--rule)] pt-2 pb-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<span class="hanko text-xs">目録</span>
				<h1
					class="font-serif text-3xl font-black tracking-tight text-[var(--text-primary)] uppercase sm:text-4xl"
				>
					Catálogo
				</h1>
			</div>
			<span class="font-mono text-xs text-[var(--text-muted)]">
				{results.length}
				{results.length === 1 ? 'obra' : 'obras'}
			</span>
		</div>

		<!-- Formulário de Busca Simples -->
		<form onsubmit={handleSearch} class="mt-6 flex flex-col gap-3 sm:flex-row">
			<div class="relative flex-1">
				<input
					type="search"
					bind:value={searchQuery}
					placeholder="Buscar por título ou autor..."
					class="w-full border border-[var(--rule)] bg-[var(--bg-secondary)] px-4 py-3 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
				/>
				{#if searchQuery}
					<button
						type="button"
						onclick={() => {
							searchQuery = '';
							handleSearch();
						}}
						class="absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
					>
						Limpar
					</button>
				{/if}
			</div>

			<button
				type="submit"
				disabled={isSearching}
				class="btn-tactile flex items-center justify-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-8 py-3 text-xs font-bold tracking-wider text-[var(--bg-primary)] uppercase disabled:opacity-50"
			>
				{#if isSearching}
					<span>Buscando...</span>
				{:else}
					<span>Buscar</span>
				{/if}
			</button>
		</form>
	</header>

	<!-- Resultados / Obras em Destaque -->
	<main>
		{#if isSearching}
			<!-- Skeleton no lugar dos resultados antigos: sem isso a grade anterior
			     ficava na tela durante a busca e parecia que nada aconteceu. -->
			<VolumeGridSkeleton count={12} />
		{:else if searchError}
			<div
				class="registration my-8 flex items-start gap-3 border border-[var(--accent)] bg-[var(--accent)]/10 p-6"
			>
				<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
				<div class="space-y-3">
					<p class="text-sm text-[var(--text-primary)]">{searchError}</p>
					<button
						type="button"
						onclick={() => handleSearch()}
						class="btn-tactile border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold text-[var(--bg-primary)] uppercase"
					>
						Tentar de novo
					</button>
				</div>
			</div>
		{:else if results.length > 0}
			<div
				class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
			>
				{#each results as manga (`${manga.source}:${manga.id}`)}
					<VolumeCard entry={manga} />
				{/each}
			</div>
		{:else}
			<div
				class="registration halftone my-8 border border-[var(--rule)] bg-[var(--bg-secondary)] p-8 text-center sm:p-12"
			>
				<div class="mx-auto max-w-sm space-y-3">
					<span class="hanko mx-auto block w-fit text-sm">無</span>
					<h3
						class="font-serif text-lg font-black tracking-tight text-[var(--text-primary)] uppercase"
					>
						Nenhuma Obra Encontrada
					</h3>
					<p class="font-mono text-xs text-[var(--text-muted)]">
						Nenhuma das fontes tem esse título. Tente outro termo ou limpe a busca.
					</p>
				</div>
			</div>
		{/if}
	</main>
</div>
