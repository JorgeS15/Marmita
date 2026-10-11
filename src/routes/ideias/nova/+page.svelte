<script>
	import { enhance } from '$app/forms';
	import IdeaForm from '$lib/components/IdeaForm.svelte';

	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Nova ideia · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header">
		<a class="btn icon ghost" href="/ideias" aria-label="Voltar às ideias">‹</a>
		<h1>Nova ideia</h1>
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
		<IdeaForm />
		<button class="btn primary block" disabled={busy}>Guardar</button>
	</form>
</main>
