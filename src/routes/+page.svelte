<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import ItemPicker from '$lib/components/ItemPicker.svelte';
	import { SLOTS, labelOf } from '$lib/constants.js';
	import { addDays, dayMonth, isISODate, mondayOf, weekDays, weekRange, weekdayName, weekdayShort } from '$lib/dates.js';

	let { data, form } = $props();

	/** @typedef {(typeof data.entries)[number]} Entry */

	const days = $derived(weekDays(data.monday));
	const thisMonday = $derived(mondayOf(data.today));
	const weekHref = $derived(`/?w=${data.monday}`);

	/** Entradas agrupadas por "data.slot". */
	const bySlot = $derived.by(() => {
		/** @type {Record<string, Entry[]>} */
		const map = {};
		for (const e of data.entries) (map[`${e.date}.${e.slot}`] ??= []).push(e);
		return map;
	});

	// ——— Painéis (estado no URL) ———
	const addTarget = $derived.by(() => {
		const raw = page.url.searchParams.get('novo');
		if (!raw) return null;
		const [date, slot] = raw.split('.');
		return isISODate(date) && (slot === 'almoco' || slot === 'jantar') ? { date, slot } : null;
	});

	const openEntry = $derived.by(() => {
		const id = Number(page.url.searchParams.get('entrada'));
		if (!id) return null;
		return data.entries.find((e) => e.id === id) ?? data.pending.find((e) => e.id === id) ?? null;
	});

	/** @param {string} date @param {string} slot */
	const addHref = (date, slot) => `${weekHref}&novo=${date}.${slot}`;
	/** @param {number} id */
	const entryHref = (id) => `${weekHref}&entrada=${id}`;

	/** @param {string} iso */
	const dayLabel = (iso) => `${weekdayShort(iso)}, ${dayMonth(iso)}`;

	// ——— Formulário de nova entrada ———
	/** @type {number | null} */
	let selectedItem = $state(null);
	let freeText = $state('');
	let units = $state(1);

	$effect(() => {
		// Repor o formulário sempre que se abre um painel novo.
		addTarget;
		selectedItem = null;
		freeText = '';
		units = 1;
	});

	$effect(() => {
		if (selectedItem != null) freeText = '';
	});

	/**
	 * Submissão com atualização suave: segue o redirect sem saltar para o topo
	 * e substitui a entrada do histórico do painel.
	 * @param {(() => boolean) | undefined} [check] devolve false para cancelar
	 * @returns {import('@sveltejs/kit').SubmitFunction}
	 */
	const submit =
		(check) =>
		({ cancel }) => {
			if (check && !check()) {
				cancel();
				return;
			}
			return async ({ result, update }) => {
				if (result.type === 'redirect') {
					await goto(result.location, { replaceState: true, noScroll: true, invalidateAll: true });
				} else {
					await update({ reset: false });
				}
			};
		};

	function confirmAdd() {
		if (selectedItem == null) return true;
		const item = data.items.find((i) => i.id === selectedItem);
		if (!item || item.free >= units) return true;
		const free = Math.max(item.free, 0);
		return confirm(
			`Só tens ${free} ${free === 1 ? 'dose livre' : 'doses livres'} de "${item.name}". Planear mesmo assim?`
		);
	}

	/** @param {Entry} e */
	function statusIcon(e) {
		if (e.status === 'eaten') return '✓';
		if (e.status === 'skipped') return '✕';
		if (e.item_id != null && (e.item_free ?? 0) < 0) return '!';
		return '';
	}

	/** @param {Entry} e */
	const statusLabel = (e) =>
		e.status === 'eaten' ? 'comida' : e.status === 'skipped' ? 'não comida' : 'planeada';
</script>

<svelte:head><title>Semana · Marmita</title></svelte:head>

<main class="page">
	<header class="page-header week-header">
		<h1>Semana de {weekRange(data.monday)}</h1>
		<nav class="row" aria-label="Navegar semanas">
			<a class="btn icon" href="/?w={addDays(data.monday, -7)}" aria-label="Semana anterior" data-sveltekit-noscroll>‹</a>
			<a class="btn" href="/" aria-disabled={data.monday === thisMonday} class:current={data.monday === thisMonday}>Hoje</a>
			<a class="btn icon" href="/?w={addDays(data.monday, 7)}" aria-label="Semana seguinte" data-sveltekit-noscroll>›</a>
		</nav>
	</header>

	{#if data.pending.length}
		<details class="pending card" open={data.pending.length <= 5}>
			<summary>
				<span>Por confirmar ({data.pending.length})</span>
				<span class="muted small">Já comeram?</span>
			</summary>
			<ul>
				{#each data.pending as e (e.id)}
					<li>
						<a class="what" href={entryHref(e.id)} data-sveltekit-noscroll>
							<strong>{e.title}</strong>
							<span class="muted small">
								{dayLabel(e.date)} · {labelOf(SLOTS, e.slot)}{#if e.units > 1} · {e.units} doses{/if}
							</span>
						</a>
						<div class="row">
							<form method="POST" action="?/status" use:enhance={submit()}>
								<input type="hidden" name="w" value={data.monday} />
								<input type="hidden" name="id" value={e.id} />
								<button class="btn small ok" name="status" value="eaten">Comido</button>
							</form>
							<form method="POST" action="?/status" use:enhance={submit()}>
								<input type="hidden" name="w" value={data.monday} />
								<input type="hidden" name="id" value={e.id} />
								<button class="btn small" name="status" value="skipped">Não comido</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	<div class="week">
		{#each days as day (day)}
			{@const isToday = day === data.today}
			<section class="day card" class:today={isToday} class:past={day < data.today} aria-labelledby="d-{day}">
				<h2 id="d-{day}">
					<span class="wd">{weekdayName(day)}</span>
					<span class="dm">{dayMonth(day)}</span>
					{#if isToday}<span class="badge accent">hoje</span>{/if}
				</h2>
				{#each SLOTS as slot (slot.value)}
					{@const list = bySlot[`${day}.${slot.value}`] ?? []}
					<div class="slot">
						<h3 class="slot-name">{slot.label}</h3>
						{#if list.length}
							<ul class="entries">
								{#each list as e (e.id)}
									<li>
										<a
											class="entry {e.status}"
											class:over={e.status === 'planned' && e.item_id != null && (e.item_free ?? 0) < 0}
											href={entryHref(e.id)}
											data-sveltekit-noscroll
										>
											<span class="icon" aria-hidden="true">{statusIcon(e)}</span>
											<span class="title">{e.title}</span>
											{#if e.units > 1}<span class="units">×{e.units}</span>{/if}
											<span class="visually-hidden">({statusLabel(e)})</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
						<a
							class="add"
							class:empty={!list.length}
							href={addHref(day, slot.value)}
							data-sveltekit-noscroll
							aria-label="Adicionar ao {slot.label.toLowerCase()} de {weekdayName(day)}, {dayMonth(day)}"
						>
							+
						</a>
					</div>
				{/each}
			</section>
		{/each}
	</div>
</main>

{#if addTarget}
	<BottomSheet
		title="Adicionar ao {labelOf(SLOTS, addTarget.slot).toLowerCase()}"
		subtitle="{weekdayName(addTarget.date)}, {dayMonth(addTarget.date)}"
		closeHref={weekHref}
	>
		<form method="POST" action="?/add" class="stack" use:enhance={submit(confirmAdd)}>
			<input type="hidden" name="w" value={data.monday} />
			<input type="hidden" name="date" value={addTarget.date} />
			<input type="hidden" name="slot" value={addTarget.slot} />

			{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}

			<ItemPicker items={data.items} today={data.today} bind:selected={selectedItem} />

			<label class="field">
				<span>Ou texto livre</span>
				<input
					type="text"
					name="title"
					maxlength="100"
					placeholder="Ex.: Jantar fora, Pizza"
					bind:value={freeText}
					oninput={() => (selectedItem = null)}
				/>
			</label>

			<div class="grid-2">
				<label class="field">
					<span>Doses</span>
					<input type="number" name="units" min="1" max="99" step="1" inputmode="numeric" bind:value={units} required />
				</label>
				<label class="field">
					<span>Nota <span class="hint">(opcional)</span></span>
					<input type="text" name="notes" maxlength="500" />
				</label>
			</div>

			<button class="btn primary block">Adicionar</button>
		</form>
	</BottomSheet>
{/if}

{#if openEntry}
	{@const e = openEntry}
	<BottomSheet
		title={e.title ?? ''}
		subtitle="{dayLabel(e.date)} · {labelOf(SLOTS, e.slot)} · {e.units} {e.units === 1 ? 'dose' : 'doses'}"
		closeHref={weekHref}
	>
		<div class="stack">
			{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}

			<div class="row">
				<span class="badge" class:ok={e.status === 'eaten'} class:accent={e.status === 'planned'}>
					{e.status === 'planned' ? 'Planeada' : e.status === 'eaten' ? 'Comida' : 'Não comida'}
				</span>
				{#if e.status === 'planned' && e.item_id != null && (e.item_free ?? 0) < 0}
					<span class="badge danger">Planeaste mais do que tens</span>
				{/if}
				{#if e.item_id == null}<span class="badge">Texto livre</span>{/if}
			</div>

			{#if e.notes}<p class="note">{e.notes}</p>{/if}

			<form method="POST" action="?/status" class="status-actions" use:enhance={submit()}>
				<input type="hidden" name="w" value={data.monday} />
				<input type="hidden" name="id" value={e.id} />
				{#if e.status === 'planned'}
					<button class="btn ok" name="status" value="eaten">✓ Comido</button>
					<button class="btn" name="status" value="skipped">✕ Não comido</button>
				{:else}
					<button class="btn" name="status" value="planned">↺ Desfazer</button>
				{/if}
			</form>

			<details class="sub">
				<summary>Editar</summary>
				<form method="POST" action="?/update" class="stack" use:enhance={submit()}>
					<input type="hidden" name="w" value={data.monday} />
					<input type="hidden" name="id" value={e.id} />
					{#if e.item_id == null}
						<label class="field">
							<span>Texto</span>
							<input type="text" name="title" maxlength="100" value={e.title} required />
						</label>
					{/if}
					<div class="grid-2">
						<label class="field">
							<span>Doses</span>
							<input type="number" name="units" min="1" max="99" step="1" inputmode="numeric" value={e.units} required />
						</label>
						<label class="field">
							<span>Nota</span>
							<input type="text" name="notes" maxlength="500" value={e.notes} />
						</label>
					</div>
					<button class="btn primary">Guardar</button>
				</form>
			</details>

			<details class="sub">
				<summary>Mover</summary>
				<form method="POST" action="?/move" class="stack" use:enhance={submit()}>
					<input type="hidden" name="w" value={data.monday} />
					<input type="hidden" name="id" value={e.id} />
					<div class="grid-2">
						<label class="field">
							<span>Dia</span>
							<input type="date" name="date" value={e.date} required />
						</label>
						<label class="field">
							<span>Refeição</span>
							<select name="slot" value={e.slot}>
								{#each SLOTS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
							</select>
						</label>
					</div>
					<button class="btn primary">Mover</button>
				</form>
			</details>

			<div class="row footer">
				{#if e.item_id != null}
					<a class="btn ghost small" href="/inventario/{e.item_id}">Ver no inventário</a>
				{/if}
				<form
					method="POST"
					action="?/remove"
					use:enhance={submit(() => confirm(`Remover "${e.title}" do plano?`))}
				>
					<input type="hidden" name="w" value={data.monday} />
					<input type="hidden" name="id" value={e.id} />
					<button class="btn danger small">Remover</button>
				</form>
			</div>

			{#if e.created_by_name}
				<p class="muted small" style="margin:0">
					Adicionado por {e.created_by_name}{#if e.updated_by_name && e.updated_by_name !== e.created_by_name}
						· alterado por {e.updated_by_name}{/if}.
				</p>
			{/if}
		</div>
	</BottomSheet>
{/if}

<style>
	.week-header h1 {
		font-size: 1.25rem;
	}

	.week-header .btn.current {
		opacity: 0.55;
	}

	/* ——— Por confirmar ——— */
	.pending {
		margin-bottom: 16px;
		background: var(--warn-soft);
		border-color: transparent;
		padding: 0;
	}

	.pending summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 48px;
		padding: 8px 14px;
		font-weight: 700;
		color: var(--warn);
		cursor: pointer;
	}

	.pending ul {
		list-style: none;
		margin: 0;
		padding: 0 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.pending li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
		padding: 10px;
		border-radius: var(--radius-sm);
		background: var(--surface);
	}

	.pending .what {
		display: flex;
		flex-direction: column;
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}

	/* ——— Semana ——— */
	.week {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.day {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
	}

	.day.today {
		border: 2px solid var(--accent);
	}

	.day.past:not(.today) {
		opacity: 0.85;
	}

	.day h2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 1rem;
	}

	.wd {
		text-transform: capitalize;
	}

	.dm {
		color: var(--text-muted);
		font-weight: 500;
		font-size: 0.9rem;
	}

	.slot {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 6px;
		padding-top: 8px;
		border-top: 1px dashed var(--border);
	}

	.slot-name {
		width: 100%;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: contents;
	}

	.entry {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		max-width: 100%;
		padding: 6px 12px;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
	}

	.entry .title {
		overflow-wrap: anywhere;
	}

	.entry .icon:empty {
		display: none;
	}

	.entry .units {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.entry.eaten {
		background: var(--ok-soft);
	}

	.entry.eaten .icon {
		color: var(--ok);
	}

	.entry.skipped {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.entry.skipped .title {
		text-decoration: line-through;
	}

	.entry.over {
		box-shadow: inset 0 0 0 2px var(--danger);
	}

	.entry.over .icon {
		color: var(--danger);
	}

	.add {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: var(--radius-sm);
		border: 1px dashed var(--border);
		color: var(--text-muted);
		text-decoration: none;
		font-size: 1.3rem;
	}

	.add.empty {
		flex: 1;
	}

	/* ——— Painel de entrada ——— */
	.note {
		margin: 0;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		white-space: pre-wrap;
	}

	.status-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 8px;
	}

	.sub {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.sub summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		padding: 0 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.sub[open] summary {
		border-bottom: 1px solid var(--border);
	}

	.sub form {
		padding: 12px;
	}

	.footer {
		justify-content: space-between;
	}

	.footer form:only-child {
		margin-left: auto;
	}

	/* ——— Ecrã largo: grelha 7 colunas × 2 linhas ——— */
	@media (min-width: 960px) {
		.week {
			display: grid;
			grid-template-columns: repeat(7, minmax(0, 1fr));
			grid-template-rows: auto auto auto;
			gap: 8px;
		}

		.day {
			grid-row: span 3;
			display: grid;
			grid-template-rows: subgrid;
			gap: 8px;
			padding: 10px;
		}

		.day h2 {
			flex-direction: column;
			gap: 0;
		}

		.slot {
			align-content: flex-start;
		}

		.entry {
			width: 100%;
			font-size: 0.9rem;
			padding: 6px 8px;
		}

		.add {
			width: 100%;
		}
	}
</style>
