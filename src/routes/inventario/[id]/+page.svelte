<script>
	import { enhance } from '$app/forms';
	import ItemForm from '$lib/components/ItemForm.svelte';
	import StockBadge from '$lib/components/StockBadge.svelte';
	import { SLOTS, labelOf } from '$lib/constants.js';
	import { dayMonth, weekStartOf, weekdayShort } from '$lib/dates.js';

	let { data, form } = $props();
	let busy = $state(false);
	const item = $derived(data.item);
</script>

<svelte:head><title>{item.name} · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header">
		<a class="btn icon ghost" href="/inventario" aria-label="Voltar ao inventário">‹</a>
		<h1>{item.name}</h1>
	</header>

	<div class="stack">
		{#if item.archived}
			<div class="alert info row" style="justify-content:space-between">
				<span>Este item está arquivado.</span>
				<form method="POST" action="?/unarchive" use:enhance>
					<button class="btn small">Repor no inventário</button>
				</form>
			</div>
		{/if}
		{#if form?.ok}<p class="alert ok" role="status">{form.ok}</p>{/if}

		<section class="card stack">
			<StockBadge quantity={item.quantity} planned={item.planned} free={item.free} />
			{#if item.free < 0}
				<p class="alert warn small" style="margin:0">Planeaste mais do que tens.</p>
			{/if}
			<h2>Próximas refeições</h2>
			{#if data.entries.length}
				<ul class="entries">
					{#each data.entries as e (e.id)}
						<li>
							<a href="/?w={weekStartOf(e.date)}&entrada={e.id}">
								{weekdayShort(e.date)}, {dayMonth(e.date)} · {labelOf(SLOTS, e.slot)}
							</a>
							<span class="muted small">{e.units} {e.units === 1 ? 'dose' : 'doses'}</span>
							{#if e.date < data.today}<span class="badge warn">por confirmar</span>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small" style="margin:0">Não está planeado.</p>
			{/if}
		</section>

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
			<ItemForm {item} today={data.today} />
			<button class="btn primary block" disabled={busy}>Guardar</button>
			<p class="muted small" style="margin:0">
				{#if item.created_by_name}Adicionado por {item.created_by_name}.{/if}
				{#if item.updated_by_name && item.updated_by_name !== item.created_by_name}
					Última alteração: {item.updated_by_name}.
				{/if}
			</p>
		</form>

		<div class="row" style="justify-content:flex-end">
			{#if !item.archived}
				<form method="POST" action="?/archive" use:enhance>
					<button class="btn">Arquivar</button>
				</form>
			{:else}
				<form
					method="POST"
					action="?/delete"
					use:enhance={({ cancel }) => {
						if (!confirm(`Apagar "${item.name}" definitivamente?`)) cancel();
					}}
				>
					<button class="btn danger">Apagar definitivamente</button>
				</form>
			{/if}
		</div>
	</div>
</main>

<style>
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.entries li {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
</style>
