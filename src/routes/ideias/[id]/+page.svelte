<script>
	import { enhance } from '$app/forms';
	import IdeaForm from '$lib/components/IdeaForm.svelte';
	import { fullDate } from '$lib/dates.js';

	let { data, form } = $props();
	let busy = $state(false);
	const idea = $derived(data.idea);
</script>

<svelte:head><title>{idea.title} · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header">
		<a class="btn icon ghost" href="/ideias" aria-label="Voltar às ideias">‹</a>
		<h1>{idea.title}</h1>
	</header>

	<form
		method="POST"
		action="?/save"
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
		{#if form?.ok}<p class="alert ok" role="status">{form.ok}</p>{/if}
		<IdeaForm {idea} />
		<button class="btn primary block" disabled={busy}>Guardar</button>
		<p class="muted small" style="margin:0">
			{#if idea.created_by_name}Escrito por {idea.created_by_name}.{/if}
			Última alteração: {fullDate(idea.updated_at.slice(0, 10))}{#if idea.updated_by_name}, por {idea.updated_by_name}{/if}.
		</p>
	</form>

	<div class="row" style="justify-content:flex-end;margin-top:12px">
		<form
			method="POST"
			action="?/delete"
			use:enhance={({ cancel }) => {
				if (!confirm(`Apagar "${idea.title}"?`)) cancel();
			}}
		>
			<button class="btn danger">Apagar</button>
		</form>
	</div>
</main>
