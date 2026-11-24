<script lang="ts">
	import VolumeCard from '$lib/components/VolumeCard.svelte';
	import VolumeGridSkeleton from '$lib/components/VolumeGridSkeleton.svelte';
	import { AlertTriangle } from 'lucide-svelte';
	import type { Manga } from '$lib/stores/manga.svelte';
	import { ApiError, BackendApiService, isAborted } from '$lib/services/api';
	import { onDestroy } from 'svelte';

	// Obras Principais Canônicas para Exibição Inicial no Catálogo com IDs reais e representativas das principais fontes
	// Destaques exibidos antes de qualquer busca. Todos apontam para fontes cujas
	// capas carregam fora do proprio site (MangaLivre e MangaLivre.blog, pelo
	// proxy /image). As capas do MangaDex ficam atras de um desafio anti-bot
	// quando pedidas de outro site, entao nao servem para a vitrine.
	const featuredMangas: Manga[] = [
		{
			id: 'berserk',
			source: 'mangalivre',
			title: 'Berserk',
			author: 'Kentarou Miura',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FBerserk-193x278.webp',
			description:
				'Guts, um ex-mercenário agora conhecido como o Espadachim Negro, busca vingança contra a Mão de Deus e os Apóstolos.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['seinen', 'action', 'supernatural', 'drama', 'horror']
		},
		{
			id: 'one-piece-ptbr',
			source: 'mangalivre',
			title: 'One Piece',
			author: 'Eiichiro Oda',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FOne-Piece-Manga-Livre-193x278.webp',
			description:
				'Monkey D. Luffy navega pelos mares com sua tripulação em busca do lendário tesouro One Piece para se tornar o Rei dos Piratas.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'adventure', 'fantasy', 'comedy']
		},
		{
			id: 'chainsaw-man-pt-br',
			source: 'mangalivre',
			title: 'Chainsaw Man',
			author: 'Tatsuki Fujimoto',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FChainsaw-Man-193x278.webp',
			description:
				'Denji se funde ao demônio da motosserra Pochita e se junta à Segurança Pública como caçador de demônios.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'supernatural', 'horror', 'demons']
		},
		{
			id: 'vagabond',
			source: 'mangalivreblog',
			title: 'Vagabond',
			author: 'Takehiko Inoue',
			coverUrl:
				'/image?url=https%3A%2F%2Flivre.xn--c5wx58dnej.online%2Fmui%2Fslimeread%2F536433%2Fcover-001-f669889f60.jpg',
			description:
				'A jornada existencial e brutal de Shinmen Takezou para se tornar o lendário mestre espadachim Miyamoto Musashi.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['seinen', 'action', 'historical', 'drama', 'martial-arts']
		},
		{
			id: 'vinland-saga',
			source: 'mangalivreblog',
			title: 'Vinland Saga',
			author: 'Makoto Yukimura',
			coverUrl:
				'/image?url=https%3A%2F%2Flivre.xn--c5wx58dnej.online%2Fmui%2Fslimeread%2F536973%2Fcover-001-b9378903ad.jpg',
			description:
				'Thorfinn, filho de um lendário guerreiro viking, busca vingança contra o assassino de seu pai em uma Europa em guerra.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['seinen', 'action', 'historical', 'adventure', 'drama']
		},
		{
			id: 'jujutsu-kaisen-ptbr',
			source: 'mangalivre',
			title: 'Jujutsu Kaisen',
			author: 'Gege Akutami',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FJujutsu-Kaisen-193x278.webp',
			description:
				'Yuji Itadori engole um dedo amaldiçoado e passa a combater maldições ancestrais na Escola Técnica de Feitiçaria de Tóquio.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'supernatural', 'demons']
		},
		{
			id: 'sousou-no-frieren',
			source: 'mangalivreblog',
			title: 'Frieren: Beyond Journey\x27s End',
			author: 'Kanehito Yamada, Tsukasa Abe',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.blog%2Fwp-content%2Fuploads%2F2026%2F10%2Fcover-001-fe8e03b3.jpg',
			description:
				'A maga elfa Frieren trilha os caminhos do passado após a morte do herói Himmel, descobrindo o valor dos laços humanos.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'fantasy', 'adventure', 'drama', 'slice-of-life']
		},
		{
			id: 'solo-leveling',
			source: 'mangalivre',
			title: 'Solo Leveling',
			author: 'Chugong',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FSolo-Leveling-193x278.webp',
			description:
				'Sung Jin-Woo, o caçador mais fraco do mundo, recebe a oportunidade única de evoluir infinitamente ao despertar um Sistema misterioso.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['action', 'adventure', 'fantasy']
		},
		{
			id: 'bleach',
			source: 'mangalivre',
			title: 'Bleach',
			author: 'Tite Kubo',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FBleach-193x278.webp',
			description:
				'Ichigo Kurosaki recebe os poderes de Ceifeiro de Almas da Shinigami Rukia Kuchiki para salvar sua família e proteger a Sociedade das Almas.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'supernatural']
		},
		{
			id: 'hunter-x-hunter',
			source: 'mangalivre',
			title: 'Hunter x Hunter',
			author: 'Yoshihiro Togashi',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FHUNTER-x-HUNTER-193x278.webp',
			description:
				'Gon Freecss almeja se tornar um Hunter de elite para desvendar os mistérios do mundo e reencontrar seu pai Ging.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'adventure', 'fantasy']
		},
		{
			id: 'fullmetal-alchemist',
			source: 'mangalivreblog',
			title: 'Fullmetal Alchemist',
			author: 'Hiromu Arakawa',
			coverUrl:
				'/image?url=https%3A%2F%2Flivre.xn--c5wx58dnej.online%2Fmui%2Fslimeread%2F560762%2Fcover-001-2ec070e4ba.jpg',
			description:
				'Edward e Alphonse Elric buscam a lendária Pedra Filosofal para recuperar seus corpos após uma transmutação humana proibida.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['shonen', 'action', 'adventure', 'fantasy', 'drama']
		},
		{
			id: 'the-beginning-after-the-end-ptbr',
			source: 'mangalivre',
			title: 'The Beginning After The End',
			author: 'TurtleMe',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F07%2FThe-Beginning-After-The-End-1-193x278.webp',
			description:
				'O Rei Grey renasce como Arthur Leywin em Dicathen, um mundo repleto de magia onde deverá proteger aqueles que ama de perigos iminentes.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['action', 'adventure', 'fantasy', 'isekai']
		},
		{
			id: 'tower-of-god-season-3',
			source: 'mangalivreblog',
			title: 'Tower of God',
			author: 'SIU',
			coverUrl:
				'/image?url=https%3A%2F%2Flivre.xn--c5wx58dnej.online%2Fmui%2Fslimeread%2F534324%2Fcover-001-759a37e780.jpg',
			description:
				'Vigésimo Quinto Bam entra na imensa Torre de Deus para reencontrar Rachel, enfrentando testes desafiadores em cada andar.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['action', 'adventure', 'fantasy', 'mystery']
		},
		{
			id: 'omniscient-reader',
			source: 'mangalivre',
			title: 'Omniscient Reader\x27s Viewpoint',
			author: 'Sing Shong',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2026%2F03%2FOmniscient-Reader-193x278.webp',
			description:
				'Kim Dokja era o único leitor de uma webnovel desconhecida. Quando o enredo vira realidade apocalíptica, ele é o único que sabe o final.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['action', 'fantasy', 'supernatural', 'adventure']
		},
		{
			id: 'nano-machine-ptbr',
			source: 'mangalivre',
			title: 'Nano Machine',
			author: 'Han-joong-wueol-ya',
			coverUrl:
				'/image?url=https%3A%2F%2Fmangalivre.to%2Fwp-content%2Fuploads%2F2025%2F10%2FNano-Machine-Nanotecnologia-Marcial-193x278.webp',
			description:
				'Cheon Yeo-Woon recebe do seu descendente do futuro uma injeção de nanomáquinas que transforma seu corpo no Culto Demoníaco.',
			progress: 0,
			lastReadPage: 0,
			totalPage: 0,
			addedAt: new Date().toISOString(),
			genres: ['action', 'martial-arts', 'fantasy', 'sci-fi']
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
