<script>
	import { page } from '$app/state';
</script>

<svelte:head><title>Erro · Marmita</title></svelte:head>

<main class="page narrow">
	<div class="card stack">
		{#if page.status === 404}
			<h1>Página não encontrada</h1>
			<p class="muted">O endereço não existe ou o registo foi apagado.</p>
		{:else}
			<h1>Algo correu mal</h1>
			<p class="muted">
				{page.error?.message === 'Internal Error'
					? 'Ocorreu um erro no servidor. Se estiveres sem rede, verifica a ligação e tenta de novo.'
					: page.error?.message}
			</p>
		{/if}
		<div class="row">
			<a class="btn primary" href="/">Ir para a semana</a>
			<button class="btn" onclick={() => location.reload()}>Recarregar</button>
		</div>
	</div>
</main>
