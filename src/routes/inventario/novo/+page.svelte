<script>
	import { enhance } from '$app/forms';
	import ItemForm from '$lib/components/ItemForm.svelte';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Novo item · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header">
		<a class="btn icon ghost" href="/inventario" aria-label="Voltar ao inventário">‹</a>
		<h1>Novo item</h1>
	</header>

	<form
		method="POST"
		class="card stack"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}
		<ItemForm today={data.today} />
		<button class="btn primary block" disabled={busy}>Adicionar ao inventário</button>
	</form>
</main>
