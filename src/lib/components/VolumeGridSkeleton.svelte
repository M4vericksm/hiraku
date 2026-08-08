<script lang="ts">
	/**
	 * Placeholder do grid de capas. Mantem a mesma proporcao e o mesmo espacamento
	 * do conteudo final, para a tela nao pular quando os dados chegam.
	 */
	let { count = 10 }: { count?: number } = $props();
</script>

<div
	class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
	aria-hidden="true"
>
	{#each Array(count), i (i)}
		<div>
			<div class="shimmer aspect-[2/3] rounded-[var(--radius)]"></div>
			<div class="shimmer mt-2.5 h-3 w-4/5 rounded-[var(--radius)]"></div>
			<div class="shimmer mt-1.5 h-2 w-1/3 rounded-[var(--radius)]"></div>
		</div>
	{/each}
</div>
