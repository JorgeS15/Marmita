<script>
	import { enhance } from '$app/forms';
	import ItemForm from '$lib/components/ItemForm.svelte';
	import StockBadge from '$lib/components/StockBadge.svelte';
	import { LOCATIONS, doses, fmtNum, labelOf, slotLabel } from '$lib/constants.js';
	import { addDays, dayMonth, weekStartOf, weekdayShort } from '$lib/dates.js';

	let { data, form } = $props();
	let busy = $state(false);
	const item = $derived(data.item);
	/** Destino ao mover doses: o primeiro local diferente do atual (frigorífico → congelador e vice-versa). */
	let moveTo = $state('');
	const itemLocation = $derived(item.location); // texto: a atualização automática não repõe a escolha
	$effect(() => {
		moveTo = itemLocation === 'congelador' ? 'frigorifico' : 'congelador';
	});
</script>

<svelte:head><title>{item.name} · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header">
		<a class="btn icon ghost" href="/inventario" aria-label="Voltar ao inventário">‹</a>
		<h1>{item.name} <span class="badge">{labelOf(LOCATIONS, item.location)}</span></h1>
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
		{#if form?.ok}
			<p class="alert ok" role="status">
				{form.ok}
				{#if form.target}<a href="/inventario/{form.target}">Ver lá</a>{/if}
			</p>
		{/if}

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
								{weekdayShort(e.date)}, {dayMonth(e.date)} · {slotLabel(e.slot, data.settings.morningSnack)}
							</a>
							<span class="muted small">{doses(e.units)}</span>
							{#if e.date < data.today}<span class="badge warn">por confirmar</span>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small" style="margin:0">Não está planeado.</p>
			{/if}
		</section>

		{#if !item.archived && item.quantity > 0}
			<details class="card move" open={!!form?.moved && !!form?.error}>
				<summary>↔ Mover doses para outro local</summary>
				<form method="POST" action="?/move" class="stack" use:enhance={() => async ({ update }) => update()}>
					{#if form?.moved && form?.error}<p class="alert" role="alert">{form.error}</p>{/if}
					<p class="muted small" style="margin:0">
						Ex.: congelar parte do que está no frigorífico, ou tirar uma dose do congelador para descongelar. As
						refeições planeadas acompanham as doses.
					</p>
					<div class="grid-2">
						<label class="field">
							<span>Doses <span class="hint">(de {fmtNum(item.quantity)})</span></span>
							<input type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]+)?" autocomplete="off" name="units" value="1" required />
						</label>
						<label class="field">
							<span>Para</span>
							<select name="location" bind:value={moveTo}>
								{#each LOCATIONS.filter((l) => l.value !== item.location) as l (l.value)}
									<option value={l.value}>{l.label}</option>
								{/each}
							</select>
						</label>
					</div>
					<label class="field">
						<span>Consumir até <span class="hint">(opcional)</span></span>
						{#key moveTo}
							<input type="date" name="best_before" value={moveTo === 'frigorifico' ? addDays(data.today, 3) : ''} />
						{/key}
					</label>
					<button class="btn primary">Mover</button>
				</form>
			</details>
		{/if}

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

	.move summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 28px;
	}

	.move[open] summary {
		margin-bottom: 10px;
	}

	.entries li {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
</style>
