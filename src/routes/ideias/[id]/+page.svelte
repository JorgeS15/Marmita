<script>
	import { enhance } from '$app/forms';
	import IdeaForm from '$lib/components/IdeaForm.svelte';
	import DayChips from '$lib/components/DayChips.svelte';
	import PersonPicker from '$lib/components/PersonPicker.svelte';
	import { fullDate } from '$lib/dates.js';

	let { data, form } = $props();
	let busy = $state(false);
	let planning = $state(false);
	/** @type {'meal' | 'prep'} */
	let kind = $state('meal');
	let move = $state(false);
	/** @type {HTMLFormElement | undefined} */
	let ideaForm = $state();
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
		bind:this={ideaForm}
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		{#if form?.error && !('planning' in form)}<p class="alert" role="alert">{form.error}</p>{/if}
		{#if form?.ok}<p class="alert ok" role="status">{form.ok}</p>{/if}
		<IdeaForm {idea} />
		<button class="btn primary block" disabled={busy}>Guardar</button>
		<p class="muted small" style="margin:0">
			{#if idea.created_by_name}Escrito por {idea.created_by_name}.{/if}
			Última alteração: {fullDate(idea.updated_at.slice(0, 10))}{#if idea.updated_by_name}, por {idea.updated_by_name}{/if}.
		</p>
	</form>

	{#if planning}
		<form
			method="POST"
			action="?/plan"
			class="card stack plan"
			use:enhance={({ formData }) => {
				// Leva também o título e o texto como estão agora (mesmo que ainda não guardados).
				if (ideaForm) {
					const current = new FormData(ideaForm);
					formData.set('title', String(current.get('title') ?? ''));
					formData.set('body', String(current.get('body') ?? ''));
				}
				busy = true;
				return async ({ result, update }) => {
					await update();
					busy = false;
					planning = result.type === 'failure';
				};
			}}
		>
			<h2>Levar para o calendário</h2>
			{#if form?.error && 'planning' in form}<p class="alert" role="alert">{form.error}</p>{/if}
			<div class="chips" role="group" aria-label="Adicionar como">
				<button type="button" class="chip" aria-pressed={kind === 'meal'} onclick={() => (kind = 'meal')}>🍽️ Refeição</button>
				<button type="button" class="chip" aria-pressed={kind === 'prep'} onclick={() => (kind = 'prep')}>🍳 Preparação</button>
			</div>
			<input type="hidden" name="kind" value={kind} />
			<DayChips start={data.start} today={data.today} />
			{#if kind === 'meal'}
				<label class="field">
					<span>Refeição</span>
					<select name="slot" value="jantar">
						{#each data.slots as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
					</select>
				</label>
			{/if}
			<PersonPicker users={data.users} />
			<label class="check">
				<input type="checkbox" name="move" bind:checked={move} />
				Tirar das ideias (mover em vez de copiar)
			</label>
			<div class="row">
				<button type="button" class="btn ghost" onclick={() => (planning = false)}>Cancelar</button>
				<button class="btn primary" style="flex:1" disabled={busy}>{move ? 'Mover' : 'Copiar'} para o calendário</button>
			</div>
		</form>
	{/if}

	<div class="row" style="justify-content:flex-end;margin-top:12px">
		{#if !planning}
			<button type="button" class="btn" onclick={() => (planning = true)}>📅 Planear</button>
		{/if}
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

<style>
	.plan {
		margin-top: 12px;
	}

	.plan h2 {
		margin: 0;
		font-size: 1.05rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
	}

	.check input {
		width: 20px;
		height: 20px;
	}
</style>
