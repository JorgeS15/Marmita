<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import ItemPicker from '$lib/components/ItemPicker.svelte';
	import PersonPicker from '$lib/components/PersonPicker.svelte';
	import PrepEditor from '$lib/components/PrepEditor.svelte';
	import DayChips from '$lib/components/DayChips.svelte';
	import { CATEGORIES, LOCATIONS, SLOT_VALUES, doses, fmtNum, labelOf, normalize, slotLabel, slotsFor } from '$lib/constants.js';
	import {
		addDays,
		dayMonth,
		isISODate,
		weekDays,
		weekRange,
		weekStartOf,
		weekdayName,
		weekdayShort,
		weekdayTitle
	} from '$lib/dates.js';

	let { data, form } = $props();

	/** @typedef {(typeof data.entries)[number]} Entry */

	const days = $derived(weekDays(data.start));
	const thisWeek = $derived(weekStartOf(data.today, data.settings.weekStartsMonday));

	// ——— Telemóvel: dias lado a lado, a deslizar ———
	/** @type {HTMLDivElement | undefined} */
	let weekEl = $state();
	/** Dia visível no telemóvel (para marcar no seletor de dias). */
	let visibleDay = $state('');
	const isCarousel = () => !!weekEl && getComputedStyle(weekEl).overflowX === 'auto';

	/** @param {string} day @param {ScrollBehavior} [behavior] */
	function showDay(day, behavior = 'smooth') {
		const el = weekEl?.querySelector(`[data-day="${day}"]`);
		if (!weekEl || !(el instanceof HTMLElement) || !isCarousel()) return;
		weekEl.scrollTo({ left: el.offsetLeft - weekEl.offsetLeft, behavior });
		visibleDay = day;
	}

	function onWeekScroll() {
		if (!weekEl || !isCarousel()) return;
		const cards = /** @type {HTMLElement[]} */ ([...weekEl.querySelectorAll('[data-day]')]);
		const x = weekEl.scrollLeft;
		let best = cards[0];
		for (const c of cards) if (Math.abs(c.offsetLeft - weekEl.offsetLeft - x) < Math.abs(best.offsetLeft - weekEl.offsetLeft - x)) best = c;
		if (best) visibleDay = best.dataset.day ?? '';
	}

	// Ao abrir (ou mudar de semana), começa no dia de hoje — ou no primeiro dia, noutras semanas.
	// Só depende da semana: a atualização automática dos dados não mexe no deslizar.
	const weekStart = $derived(data.start); // texto: não muda com a atualização automática
	$effect(() => {
		const start = weekStart;
		if (!weekEl) return;
		untrack(() => showDay(start === thisWeek ? data.today : start, 'instant'));
	});
	const weekHref = $derived(`/?w=${data.start}`);
	const everyone = $derived(data.users.length === 2 ? 'Ambos' : 'Todos');
	const morningSnack = $derived(data.settings.morningSnack);
	/** Refeições visíveis nesta semana (o lanche da manhã aparece se já tiver entradas). */
	const slots = $derived(slotsFor(morningSnack, data.entries.some((e) => e.slot === 'lanche_manha')));
	/** @param {string} slot */
	const label = (slot) => slotLabel(slot, morningSnack);
	/** Faixa das refeições para todos: as cores de todas as pessoas. */
	const bothStripe = $derived.by(() => {
		const colors = data.users.map((u) => u.color);
		if (colors.length < 2) return colors[0] ?? 'var(--text-muted)';
		const step = 100 / colors.length;
		return `linear-gradient(${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
	});

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
		return isISODate(date) && SLOT_VALUES.includes(/** @type {any} */ (slot)) ? { date, slot } : null;
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
	/** @param {string} date */
	const prepNewHref = (date) => `${weekHref}&preparar=${date}`;
	/** @param {number} id */
	const prepHref = (id) => `${weekHref}&preparacao=${id}`;

	// ——— Preparações ———
	const prepsByDay = $derived.by(() => {
		/** @type {Record<string, (typeof data.preparations)[number][]>} */
		const map = {};
		for (const p of data.preparations) (map[p.date] ??= []).push(p);
		return map;
	});

	const prepNewDate = $derived.by(() => {
		const raw = page.url.searchParams.get('preparar');
		return raw && isISODate(raw) ? raw : null;
	});

	const openPrep = $derived.by(() => {
		const id = Number(page.url.searchParams.get('preparacao'));
		return id ? (data.preparations.find((p) => p.id === id) ?? null) : null;
	});

	/** Itens do inventário com o mesmo nome da preparação (as doses juntam-se ao do mesmo local). */
	const sameName = $derived(
		openPrep ? data.items.filter((i) => normalize(i.name) === normalize(openPrep.title)) : []
	);
	/** "" = pôr no inventário; "none" = não pôr. */
	let prepTarget = $state('');
	/** Doses por local ao confirmar (texto, como nos campos). @type {Record<string, string>} */
	let split = $state({});
	// Só repõe ao abrir outra preparação (não a cada atualização dos dados em segundo plano).
	const openPrepId = $derived(openPrep?.id ?? null);
	$effect(() => {
		openPrepId;
		untrack(() => {
			prepTarget = '';
			split = defaultSplit();
		});
	});

	/**
	 * Sugestão de divisão: as refeições de "Para quando?" até 3 dias depois de
	 * preparar ficam no frigorífico, as restantes no congelador (4 doses no
	 * congelador se não houver refeições marcadas).
	 */
	function defaultSplit() {
		const p = openPrep;
		/** @type {Record<string, string>} */
		const out = Object.fromEntries(LOCATIONS.map((l) => [l.value, '0']));
		if (!p) return out;
		const meals = data.prepMeals.filter((m) => m.prep_id === p.id);
		if (!meals.length) return { ...out, congelador: '4' };
		const soon = addDays(p.date, 3);
		const fridge = meals.filter((m) => m.date <= soon).reduce((n, m) => n + m.units, 0);
		const freezer = meals.filter((m) => m.date > soon).reduce((n, m) => n + m.units, 0);
		return { ...out, frigorifico: fmtNum(fridge), congelador: fmtNum(freezer) };
	}

	/** @param {string} v */
	const splitNum = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
	const splitTotal = $derived(Object.values(split).reduce((n, v) => n + splitNum(v), 0));

	/** @param {string} iso */
	const dayLabel = (iso) => `${weekdayShort(iso)}, ${dayMonth(iso)}`;

	/** Cor da pessoa (ou neutra quando é para todos). @param {{ person_color: string | null }} e */
	const personStyle = (e) => `--person: ${e.person_color || 'var(--text-muted)'}`;

	/** @param {{ person_name: string | null }} e */
	const personLabel = (e) => e.person_name ?? everyone;

	// ——— Formulário de nova entrada ———
	/** @type {number | string | null} id do item, ou "p<id>" para uma preparação */
	let selectedItem = $state(null);
	let freeText = $state('');
	let units = $state('1');

	/** Chave do painel "Adicionar" (texto): não muda quando os dados são atualizados em segundo plano. */
	const addKey = $derived(addTarget ? `${addTarget.date}.${addTarget.slot}` : null);
	$effect(() => {
		// Repor o formulário sempre que se abre um painel novo.
		addKey;
		selectedItem = null;
		freeText = '';
		units = '1';
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
		({ cancel, formElement }) => {
			if (check && !check()) {
				cancel();
				return;
			}
			return async ({ result, update }) => {
				if (result.type === 'redirect') {
					// Subformulários (ex.: "Usar" um ingrediente) ficam limpos e fechados.
					formElement.reset();
					formElement.closest('details')?.removeAttribute('open');
					await goto(result.location, { replaceState: true, noScroll: true, invalidateAll: true });
				} else if (result.type === 'error') {
					// Ex.: a refeição foi apagada noutro telemóvel. Volta à semana em vez de mostrar uma página de erro.
					alert(result.error?.message ?? 'Não foi possível concluir.');
					await goto(weekHref, { replaceState: true, noScroll: true, invalidateAll: true });
				} else {
					await update({ reset: false });
				}
			};
		};

	function confirmAdd() {
		if (selectedItem == null) return true;
		const item = data.items.find((i) => i.id === selectedItem);
		const wanted = Number(String(units).replace(',', '.')) || 1;
		if (!item || item.free >= wanted) return true;
		const free = Math.max(item.free, 0);
		return confirm(
			`Só tens ${fmtNum(free)} ${free <= 1 ? 'dose livre' : 'doses livres'} de "${item.name}". Planear mesmo assim?`
		);
	}

	/** @param {Entry} e */
	function statusIcon(e) {
		if (e.status === 'eaten') return '✓';
		if (e.status === 'skipped') return '✕';
		if (e.prep_id != null && e.item_id == null) return '🍳';
		if (e.item_id != null && (e.item_free ?? 0) < 0) return '!';
		return '';
	}

	// ——— Arrastar no computador (mover; com Ctrl/⌘/Alt copia) ———
	/** Só com rato: no telemóvel o toque longo serve para outras coisas. */
	let canDrag = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(pointer: fine)');
		canDrag = mq.matches;
		const on = () => (canDrag = mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});

	/** @type {{ kind: 'entry' | 'prep', id: number, date: string, slot: string | null } | null} */
	let dragging = $state(null);
	/** Alvo debaixo do rato: "data.slot" ou "data.preps". */
	let dropKey = $state('');
	let dragBusy = $state(false);

	/** @param {DragEvent} ev @param {'entry' | 'prep'} kind @param {number} id @param {string} date @param {string | null} slot */
	function dragStart(ev, kind, id, date, slot) {
		dragging = { kind, id, date, slot };
		if (ev.dataTransfer) {
			ev.dataTransfer.effectAllowed = 'copyMove';
			ev.dataTransfer.setData('text/plain', `${kind}:${id}`);
		}
	}

	function dragEnd() {
		dragging = null;
		dropKey = '';
	}

	/** @param {DragEvent} ev */
	const wantsCopy = (ev) => ev.ctrlKey || ev.metaKey || ev.altKey;

	/** @param {DragEvent} ev @param {string} date @param {string | null} slot null = preparações */
	function dragOver(ev, date, slot) {
		if (!dragging || (dragging.kind === 'prep') !== (slot === null)) return;
		ev.preventDefault();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = wantsCopy(ev) ? 'copy' : 'move';
		dropKey = `${date}.${slot ?? 'preps'}`;
	}

	/** @param {DragEvent} ev @param {string} date @param {string | null} slot */
	async function drop(ev, date, slot) {
		const d = dragging;
		dragEnd();
		if (!d || (d.kind === 'prep') !== (slot === null)) return;
		ev.preventDefault();
		const copy = wantsCopy(ev);
		if (!copy && d.date === date && d.slot === slot) return;
		const body = new FormData();
		body.set('w', data.start);
		body.set('id', String(d.id));
		let action;
		if (d.kind === 'entry') {
			body.set('slot', /** @type {string} */ (slot));
			if (copy) {
				action = 'duplicate';
				body.set('dates', date);
			} else {
				action = 'move';
				body.set('date', date);
			}
		} else if (copy) {
			action = 'prepDuplicate';
			body.set('dates', date);
		} else {
			action = 'prepMove';
			body.set('date', date);
		}
		dragBusy = true;
		try {
			const res = await fetch(`?/${action}`, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
			const result = await res.json().catch(() => ({}));
			if (result.type === 'failure' || result.type === 'error') {
				let msg = result.error?.message ?? 'Não foi possível mover.';
				try {
					msg = JSON.parse(result.data).at(-1);
				} catch {
					/* mensagem genérica */
				}
				alert(msg);
			}
		} catch {
			alert('Sem ligação: não foi possível mover.');
		} finally {
			await invalidateAll();
			dragBusy = false;
		}
	}

	/** @param {Entry} e */
	const statusLabel = (e) =>
		e.status === 'eaten' ? 'consumida' : e.status === 'skipped' ? 'não consumida' : 'planeada';
</script>

<svelte:head><title>Semana · Marmita</title></svelte:head>

<main class="page">
	<header class="page-header week-header">
		<h1>Semana de <span class="nowrap">{weekRange(data.start)}</span></h1>
		<nav class="row" aria-label="Navegar semanas">
			<a class="btn icon" href="/?w={addDays(data.start, -7)}" aria-label="Semana anterior" data-sveltekit-noscroll>‹</a>
			<a class="btn" href="/" aria-disabled={data.start === thisWeek} class:current={data.start === thisWeek}>Hoje</a>
			<a class="btn icon" href="/?w={addDays(data.start, 7)}" aria-label="Semana seguinte" data-sveltekit-noscroll>›</a>
		</nav>
	</header>

	{#if data.users.length > 1}
		<ul class="legend" aria-label="Pessoas">
			{#each data.users as u (u.id)}
				<li style="--person: {u.color}"><span class="dot" aria-hidden="true"></span>{u.display_name}</li>
			{/each}
		</ul>
	{/if}

	{#if data.toThaw.length}
		<section class="thaw card" aria-labelledby="thaw-title">
			<h2 id="thaw-title">🧊 Tirar do congelador</h2>
			<ul>
				{#each data.toThaw as e (`${e.kind}-${e.id}`)}
					<li style={personStyle(e)}>
						<div class="what">
							<strong>{e.title}</strong>
							<span class="muted small">
								{e.date === data.today ? 'Hoje' : 'Amanhã'} ·
								{e.kind === 'entry' ? label(e.slot ?? '') : `para ${e.prep_title}`}{e.units !== 1 ? ` · ${doses(e.units)}` : ''}
							</span>
						</div>
						<form method="POST" action="?/thaw" use:enhance={submit()}>
							<input type="hidden" name="w" value={data.start} />
							<input type="hidden" name="id" value={e.id} />
							<input type="hidden" name="kind" value={e.kind} />
							<button class="btn small">Já tirei</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.pending.length}
		<details class="pending card" open={data.pending.length <= 5}>
			<summary>
				<span>Por confirmar ({data.pending.length})</span>
				<span class="muted small">Já comeram?</span>
			</summary>
			<ul>
				{#each data.pending as e (e.id)}
					<li style={personStyle(e)}>
						<a class="what" href={entryHref(e.id)} data-sveltekit-noscroll>
							<strong>{e.title}</strong>
							<span class="muted small">
								{[dayLabel(e.date), label(e.slot), personLabel(e), e.units !== 1 ? doses(e.units) : '']
									.filter(Boolean)
									.join(' · ')}
							</span>
						</a>
						<div class="row">
							<form method="POST" action="?/status" use:enhance={submit()}>
								<input type="hidden" name="w" value={data.start} />
								<input type="hidden" name="id" value={e.id} />
								<button class="btn small ok" name="status" value="eaten">Consumido</button>
							</form>
							<form method="POST" action="?/status" use:enhance={submit()}>
								<input type="hidden" name="w" value={data.start} />
								<input type="hidden" name="id" value={e.id} />
								<button class="btn small" name="status" value="skipped">Não consumido</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	<nav class="day-picker" aria-label="Dias da semana">
		{#each days as day (day)}
			<button
				type="button"
				class:today={day === data.today}
				class:past={day < data.today}
				aria-current={visibleDay === day ? 'true' : undefined}
				onclick={() => showDay(day)}
			>
				<span class="wd">{weekdayShort(day)}</span>
				<span class="dn">{Number(day.slice(8))}</span>
			</button>
		{/each}
	</nav>

	<div
		class="week"
		bind:this={weekEl}
		onscroll={onWeekScroll}
		aria-busy={dragBusy}
		style="--both: {bothStripe}; --rows: {slots.length + 2}"
	>
		{#each days as day (day)}
			{@const isToday = day === data.today}
			{@const preps = prepsByDay[day] ?? []}
			<section class="day card" class:today={isToday} class:past={day < data.today} aria-labelledby="d-{day}" data-day={day}>
				<h2 id="d-{day}">
					<span class="wd">{weekdayTitle(day)}</span>
					<span class="dm">{dayMonth(day)}</span>
					{#if isToday}<span class="badge accent">hoje</span>{/if}
				</h2>
				{#each slots as slot (slot.value)}
					{@const list = bySlot[`${day}.${slot.value}`] ?? []}
					<div
						class="slot"
						class:minor={slot.minor}
						class:drop-over={dropKey === `${day}.${slot.value}`}
						role="group"
						aria-label="{slot.label} de {weekdayName(day)}"
						ondragover={(ev) => dragOver(ev, day, slot.value)}
						ondragleave={() => dropKey === `${day}.${slot.value}` && (dropKey = '')}
						ondrop={(ev) => drop(ev, day, slot.value)}
					>
						<div class="slot-head">
							<h3 class="slot-name">
								<span class="long">{slot.label}</span><span class="short" aria-hidden="true">{slot.short}</span>
							</h3>
							<a
								class="add"
								href={addHref(day, slot.value)}
								data-sveltekit-noscroll
								aria-label="Adicionar ao {slot.label.toLowerCase()} de {weekdayName(day)}, {dayMonth(day)}"
							>
								+
							</a>
						</div>
						{#if list.length}
							<ul class="entries">
								{#each list as e (e.id)}
									<li>
										<a
											class="entry {e.status}"
											class:everyone={e.person_id == null}
											class:waiting={e.prep_id != null && e.prep_status === 'planned'}
											class:over={e.status === 'planned' && e.item_id != null && (e.item_free ?? 0) < 0}
											class:dragging={dragging?.kind === 'entry' && dragging.id === e.id}
											style={personStyle(e)}
											href={entryHref(e.id)}
											data-sveltekit-noscroll
											draggable={canDrag}
											title={canDrag ? 'Arrasta para outro dia ou refeição (com Ctrl copia)' : undefined}
											ondragstart={(ev) => dragStart(ev, 'entry', e.id, e.date, e.slot)}
											ondragend={dragEnd}
										>
											<span class="icon" aria-hidden="true">{statusIcon(e)}</span>
											<span class="title">{e.title}</span>
											<span class="visually-hidden">({personLabel(e)}, {statusLabel(e)})</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
				<div
					class="slot preps"
					class:drop-over={dropKey === `${day}.preps`}
					role="group"
					aria-label="Preparações de {weekdayName(day)}"
					ondragover={(ev) => dragOver(ev, day, null)}
					ondragleave={() => dropKey === `${day}.preps` && (dropKey = '')}
					ondrop={(ev) => drop(ev, day, null)}
				>
					<div class="slot-head">
						<h3 class="slot-name">
							<span class="long">Preparações</span><span class="short" aria-hidden="true">Preparar</span>
						</h3>
						<a
							class="add"
							href={prepNewHref(day)}
							data-sveltekit-noscroll
							aria-label="Agendar preparação para {weekdayName(day)}, {dayMonth(day)}"
						>
							+
						</a>
					</div>
					{#if preps.length}
						<ul class="entries">
							{#each preps as p (p.id)}
								<li>
									<a
										class="entry prep {p.status === 'done' ? 'eaten' : ''}"
										class:everyone={p.person_id == null}
										class:dragging={dragging?.kind === 'prep' && dragging.id === p.id}
										style={personStyle(p)}
										href={prepHref(p.id)}
										data-sveltekit-noscroll
										draggable={canDrag}
										title={canDrag ? 'Arrasta para outro dia (com Ctrl copia)' : undefined}
										ondragstart={(ev) => dragStart(ev, 'prep', p.id, p.date, null)}
										ondragend={dragEnd}
									>
										<span class="icon" aria-hidden="true">{p.status === 'done' ? '✓' : '🍳'}</span>
										<span class="title">{p.title}</span>
										<span class="visually-hidden">
											(preparação, {personLabel(p)}, {p.status === 'done' ? 'preparada' : 'por preparar'})
										</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>
		{/each}
	</div>
</main>

{#if addTarget}
	<BottomSheet
		title="Adicionar ao {label(addTarget.slot).toLowerCase()}"
		subtitle="{weekdayName(addTarget.date)}, {dayMonth(addTarget.date)}"
		closeHref={weekHref}
	>
		<form method="POST" action="?/add" class="stack" use:enhance={submit(confirmAdd)}>
			<input type="hidden" name="w" value={data.start} />
			<input type="hidden" name="date" value={addTarget.date} />
			<input type="hidden" name="slot" value={addTarget.slot} />

			{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}

			<PersonPicker users={data.users} value={data.user?.id ?? null} />

			<ItemPicker
				items={data.items}
				preps={data.openPreps.filter((pr) => pr.date <= addTarget.date && pr.date >= data.today)}
				today={data.today}
				bind:selected={selectedItem}
			/>

			<label class="field">
				<span>Ou texto livre</span>
				<input
					type="text"
					name="title"
					maxlength="100"
					placeholder="Ex.: Jantar fora, Pizza, Iogurte"
					bind:value={freeText}
					oninput={() => (selectedItem = null)}
				/>
			</label>

			<div class="grid-2">
				<label class="field">
					<span>Doses</span>
					<input type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]+)?" autocomplete="off" name="units" bind:value={units} required />
				</label>
				<label class="field">
					<span>Nota <span class="hint">(opcional)</span></span>
					<input type="text" name="notes" maxlength="500" />
				</label>
			</div>

			<div class="sheet-actions">
				<button class="btn primary block">Adicionar</button>
			</div>
		</form>
	</BottomSheet>
{/if}

{#if prepNewDate}
	<BottomSheet title="Agendar preparação" subtitle="{weekdayName(prepNewDate)}, {dayMonth(prepNewDate)}" closeHref={weekHref}>
		<form method="POST" action="?/prepAdd" class="stack" use:enhance={submit()}>
			<input type="hidden" name="w" value={data.start} />
			<input type="hidden" name="date" value={prepNewDate} />
			{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}
			<label class="field">
				<span>O que vais preparar?</span>
				<input type="text" name="title" required maxlength="100" placeholder="Ex.: Caril de frango" />
			</label>
			<PersonPicker users={data.users} value={data.user?.id ?? null} />
			<label class="field">
				<span>Nota <span class="hint">(opcional)</span></span>
				<textarea name="notes" maxlength="2000" rows="4" placeholder="Ex.: descongelar o frango na véspera"></textarea>
			</label>
			<div class="sheet-actions">
				<button class="btn primary block">Agendar</button>
			</div>
		</form>
	</BottomSheet>
{/if}

{#if openPrep}
	{@const p = openPrep}
	{@const prepMeals = data.prepMeals.filter((m) => m.prep_id === p.id)}
	{@const prepIngredients = data.ingredients.filter((g) => g.prep_id === p.id)}
	<BottomSheet
		title={p.title}
		subtitle="Preparação · {dayLabel(p.date)} · {personLabel(p)}"
		closeHref={weekHref}
	>
		<div class="stack">
			{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}

			{#if p.status === 'done'}
				{#if p.notes}<p class="note">{p.notes}</p>{/if}
				<p class="alert ok" style="margin:0">
					{#if data.prepOutputs.some((o) => o.prep_id === p.id)}
						Preparado:
						{#each data.prepOutputs.filter((o) => o.prep_id === p.id) as o, i (o.id)}
							{i ? ', ' : ''}+{doses(o.units)} no
							{#if o.item_id}<a href="/inventario/{o.item_id}">{labelOf(LOCATIONS, o.location).toLowerCase()}</a>{:else}inventário{/if}
						{/each}.
					{:else}
						Preparado (sem pôr no inventário).
					{/if}
				</p>
				{#if prepIngredients.length}
					<p class="muted small" style="margin:0">
						Ingredientes descontados: {prepIngredients.map((g) => `${g.name} (${fmtNum(g.consumed)})`).join(', ')}
					</p>
				{/if}
				<form method="POST" action="?/prepUndo" use:enhance={submit(() => confirm('Desfazer? As doses adicionadas saem do inventário e os ingredientes voltam ao stock.'))}>
					<input type="hidden" name="w" value={data.start} />
					<input type="hidden" name="id" value={p.id} />
					<button class="btn block">↺ Desfazer</button>
				</form>
			{:else}
				{#key p.id}
					<PrepEditor prep={p} users={data.users} week={data.start} />
				{/key}

				<section class="prep-part" aria-labelledby="prep-meals">
					<h3 id="prep-meals">🍽️ Para quando?</h3>
					{#if prepMeals.length}
						<ul class="prep-list">
							{#each prepMeals as m (m.id)}
								<li style="--person: {m.person_color || 'var(--text-muted)'}">
									<span class="dot" aria-hidden="true"></span>
									<span class="grow">
										{dayLabel(m.date)} · {label(m.slot)} · {m.person_name ?? everyone}
										<span class="muted">· {doses(m.units)}</span>
									</span>
									<form method="POST" action="?/remove" use:enhance={submit()}>
										<input type="hidden" name="w" value={data.start} />
										<input type="hidden" name="id" value={m.id} />
										<input type="hidden" name="prep" value={p.id} />
										<button class="btn icon ghost small" aria-label="Tirar esta refeição">✕</button>
									</form>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="muted small" style="margin:0">Ainda não está marcada para nenhuma refeição.</p>
					{/if}
					<details class="sub">
						<summary>+ Marcar refeição</summary>
						<form method="POST" action="?/prepMeal" class="stack" use:enhance={submit()}>
							<input type="hidden" name="w" value={data.start} />
							<input type="hidden" name="id" value={p.id} />
							<div class="grid-2">
								<label class="field">
									<span>Dia</span>
									<input type="date" name="date" value={p.date} min={p.date} required />
								</label>
								<label class="field">
									<span>Refeição</span>
									<select name="slot" value="jantar">
										{#each slotsFor(morningSnack) as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
									</select>
								</label>
							</div>
							<PersonPicker users={data.users} value={p.person_id} />
							<label class="field">
								<span>Doses</span>
								<input type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]+)?" autocomplete="off" name="units" value="1" required />
							</label>
							<button class="btn primary">Marcar</button>
						</form>
					</details>
				</section>

				<section class="prep-part" aria-labelledby="prep-ings">
					<h3 id="prep-ings">🧊 Ingredientes do inventário</h3>
					{#if prepIngredients.length}
						<ul class="prep-list">
							{#each prepIngredients as g (g.id)}
								<li>
									<span class="grow">
										{g.name} <span class="muted">· {doses(g.units)} · {labelOf(LOCATIONS, g.location)}</span>
										{#if g.free < 0}<span class="badge danger">falta</span>{/if}
									</span>
									<form method="POST" action="?/prepIngredientRemove" use:enhance={submit()}>
										<input type="hidden" name="w" value={data.start} />
										<input type="hidden" name="id" value={p.id} />
										<input type="hidden" name="ingredient_id" value={g.id} />
										<button class="btn icon ghost small" aria-label="Tirar {g.name}">✕</button>
									</form>
								</li>
							{/each}
						</ul>
						<p class="muted small" style="margin:0">Ficam reservados e são descontados do stock ao confirmar "Preparado".</p>
					{/if}
					<details class="sub">
						<summary>+ Usar do inventário</summary>
						<form method="POST" action="?/prepIngredientAdd" class="stack" use:enhance={submit()}>
							<input type="hidden" name="w" value={data.start} />
							<input type="hidden" name="id" value={p.id} />
							<label class="field">
								<span>Item</span>
								<select name="item_id" required>
									<option value="" disabled selected>Escolhe…</option>
									{#each LOCATIONS as l (l.value)}
										{@const group = data.items.filter((i) => i.location === l.value)}
										{#if group.length}
											<optgroup label={l.label}>
												{#each group as i (i.id)}
													<option value={i.id}>{i.name} — {i.free > 0 ? `${fmtNum(i.free)} ${i.free <= 1 ? 'livre' : 'livres'}` : 'nenhuma livre'}</option>
												{/each}
											</optgroup>
										{/if}
									{/each}
								</select>
							</label>
							<label class="field">
								<span>Doses</span>
								<input type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]+)?" autocomplete="off" name="units" value="1" required />
							</label>
							<button class="btn primary">Usar</button>
						</form>
					</details>
				</section>

				<details class="sub done-box">
					<summary>✓ Preparado — confirmar</summary>
					<form method="POST" action="?/prepDone" class="stack" use:enhance={submit()}>
						<input type="hidden" name="w" value={data.start} />
						<input type="hidden" name="id" value={p.id} />
						<label class="field">
							<span>No inventário</span>
							<select name="target" bind:value={prepTarget}>
								<option value="">Pôr no inventário</option>
								<option value="none">Não pôr no inventário</option>
							</select>
						</label>
						{#if prepTarget !== 'none'}
							<fieldset class="split">
								<legend>Doses por local <span class="hint">(total: {fmtNum(splitTotal)})</span></legend>
								{#each LOCATIONS as l (l.value)}
									{@const join = sameName.find((i) => i.location === l.value)}
									<div class="split-row" class:off={splitNum(split[l.value]) <= 0}>
										<label class="field">
											<span>{l.label}</span>
											<input
												type="text"
												inputmode="decimal"
												pattern="[0-9]+([.,][0-9]+)?"
												autocomplete="off"
												name="units_{l.value}"
												bind:value={split[l.value]}
											/>
										</label>
										{#if splitNum(split[l.value]) > 0}
											<label class="field">
												<span>Consumir até <span class="hint">(opcional)</span></span>
												<input
													type="date"
													name="best_before_{l.value}"
													value={l.value === 'frigorifico' ? addDays(p.date, 3) : ''}
												/>
											</label>
											{#if join}
												<p class="muted small join">Junta a "{join.name}" ({fmtNum(join.quantity)} em stock).</p>
											{/if}
										{/if}
									</div>
								{/each}
								{#if prepMeals.length}
									<p class="muted small" style="margin:0">
										As refeições de "Para quando?" ficam com o frigorífico primeiro (as mais próximas) e o congelador
										depois.
									</p>
								{/if}
							</fieldset>
							<div class="grid-2">
								<label class="field">
									<span>Nome</span>
									<input type="text" name="name" maxlength="100" value={p.title} required />
								</label>
								<label class="field">
									<span>Preparado em</span>
									<input type="date" name="stored_on" value={p.date} required />
								</label>
							</div>
							<label class="field">
								<span>Categoria</span>
								<select name="category" value={sameName[0]?.category ?? 'outro'}>
									{#each CATEGORIES as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
								</select>
							</label>
							<label class="field">
								<span>Notas do item <span class="hint">(opcional)</span></span>
								<textarea name="item_notes" maxlength="1000" rows="2">{p.notes}</textarea>
							</label>
						{/if}
						{#if prepIngredients.length}
							<p class="muted small" style="margin:0">
								Desconta do stock: {prepIngredients.map((g) => `${g.name} (${fmtNum(g.units)})`).join(', ')}.
							</p>
						{/if}
						<div class="sheet-actions">
							<button class="btn primary block">Confirmar preparação</button>
						</div>
					</form>
				</details>
			{/if}

			<details class="sub">
				<summary>⧉ Duplicar</summary>
				<form method="POST" action="?/prepDuplicate" class="stack" use:enhance={submit()}>
					<input type="hidden" name="w" value={data.start} />
					<input type="hidden" name="id" value={p.id} />
					<DayChips start={data.start} today={data.today} exclude={p.date} />
					<button class="btn primary">Duplicar</button>
				</form>
			</details>

			<div class="row footer">
				<form
					method="POST"
					action="?/prepRemove"
					use:enhance={submit(() =>
						confirm(
							p.status === 'done'
								? `Remover "${p.title}" do calendário? O item no inventário mantém-se.`
								: `Remover a preparação "${p.title}"?`
						)
					)}
				>
					<input type="hidden" name="w" value={data.start} />
					<input type="hidden" name="id" value={p.id} />
					<button class="btn danger small">Remover</button>
				</form>
			</div>

			{#if p.created_by_name}
				<p class="muted small" style="margin:0">Agendado por {p.created_by_name}.</p>
			{/if}
		</div>
	</BottomSheet>
{/if}

{#if openEntry}
	{@const e = openEntry}
	<BottomSheet
		title={e.title ?? ''}
		subtitle="{dayLabel(e.date)} · {label(e.slot)} · {doses(e.units)}"
		closeHref={weekHref}
	>
		<div class="stack">
			{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}

			<div class="row">
				<span class="person-badge" style={personStyle(e)}><span class="dot" aria-hidden="true"></span>{personLabel(e)}</span>
				<span class="badge" class:ok={e.status === 'eaten'} class:accent={e.status === 'planned'}>
					{e.status === 'planned' ? 'Planeada' : e.status === 'eaten' ? 'Consumida' : 'Não consumida'}
				</span>
				{#if e.status === 'planned' && e.item_id != null && (e.item_free ?? 0) < 0}
					<span class="badge danger">Planeaste mais do que tens</span>
				{/if}
				{#if e.item_id == null}<span class="badge">Texto livre</span>{/if}
			</div>

			{#if e.prep_id != null && e.item_id == null}
				<p class="alert info small" style="margin:0">
					🍳 Vem da preparação de {e.prep_date ? dayLabel(e.prep_date) : '—'}, ainda por fazer. Quando a
					confirmares, esta refeição passa a contar no inventário.
				</p>
			{/if}

			{#if e.status === 'planned' && e.item_location === 'congelador'}
				<form method="POST" action="?/thaw" class="row" use:enhance={submit()}>
					<input type="hidden" name="w" value={data.start} />
					<input type="hidden" name="id" value={e.id} />
					{#if e.thawed}
						<span class="muted small">🧊 Já tirado do congelador.</span>
						<input type="hidden" name="undo" value="1" />
						<button class="btn small ghost">Desfazer</button>
					{:else}
						<button class="btn small">🧊 Já tirei do congelador</button>
					{/if}
				</form>
			{/if}

			{#if e.notes}
				<div class="note-block">
					<h3>Nota da refeição</h3>
					<p class="note">{e.notes}</p>
				</div>
			{/if}
			{#if e.item_id != null && e.item_notes}
				<div class="note-block">
					<h3>Notas do item</h3>
					<p class="note">{e.item_notes}</p>
				</div>
			{/if}

			<form method="POST" action="?/status" class="status-actions" use:enhance={submit()}>
				<input type="hidden" name="w" value={data.start} />
				<input type="hidden" name="id" value={e.id} />
				<!-- Os dois botões ficam sempre visíveis: o escolhido fica marcado e tocar-lhe outra vez desfaz. -->
				<button
					class="btn ok"
					class:chosen={e.status === 'eaten'}
					name="status"
					value={e.status === 'eaten' ? 'planned' : 'eaten'}
					aria-pressed={e.status === 'eaten'}
					title={e.status === 'eaten' ? 'Tocar outra vez para desfazer' : undefined}
				>
					✓ Consumido
				</button>
				<button
					class="btn"
					class:chosen={e.status === 'skipped'}
					name="status"
					value={e.status === 'skipped' ? 'planned' : 'skipped'}
					aria-pressed={e.status === 'skipped'}
					title={e.status === 'skipped' ? 'Tocar outra vez para desfazer' : undefined}
				>
					✕ Não consumido
				</button>
			</form>

			<details class="sub">
				<summary>Editar</summary>
				<form method="POST" action="?/update" class="stack" use:enhance={submit()}>
					<input type="hidden" name="w" value={data.start} />
					<input type="hidden" name="id" value={e.id} />
					<PersonPicker users={data.users} value={e.person_id} />
					{#if e.item_id == null}
						<label class="field">
							<span>Texto</span>
							<input type="text" name="title" maxlength="100" value={e.title} required />
						</label>
					{/if}
					<div class="grid-2">
						<label class="field">
							<span>Doses</span>
							<input type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]+)?" autocomplete="off" name="units" value={fmtNum(e.units)} required />
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
				<summary>⧉ Duplicar</summary>
				<form method="POST" action="?/duplicate" class="stack" use:enhance={submit()}>
					<input type="hidden" name="w" value={data.start} />
					<input type="hidden" name="id" value={e.id} />
					<DayChips start={data.start} today={data.today} exclude={e.date} />
					<label class="field">
						<span>Refeição</span>
						<select name="slot" value={e.slot}>
							{#each slotsFor(morningSnack, e.slot === 'lanche_manha') as s (s.value)}
								<option value={s.value}>{s.label}</option>
							{/each}
						</select>
					</label>
					<button class="btn primary">Duplicar</button>
				</form>
			</details>

			<details class="sub">
				<summary>Mover</summary>
				<form method="POST" action="?/move" class="stack" use:enhance={submit()}>
					<input type="hidden" name="w" value={data.start} />
					<input type="hidden" name="id" value={e.id} />
					<div class="grid-2">
						<label class="field">
							<span>Dia</span>
							<input type="date" name="date" value={e.date} required />
						</label>
						<label class="field">
							<span>Refeição</span>
							<select name="slot" value={e.slot}>
								{#each slotsFor(morningSnack, e.slot === 'lanche_manha') as s (s.value)}
									<option value={s.value}>{s.label}</option>
								{/each}
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
					<input type="hidden" name="w" value={data.start} />
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

	/* ——— Seletor de dias (só no telemóvel) ——— */
	.day-picker {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
		margin-bottom: 10px;
	}

	.day-picker button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		min-height: 44px;
		padding: 4px 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	.day-picker .wd {
		font-size: 0.7rem;
		text-transform: capitalize;
		color: var(--text-muted);
	}

	.day-picker .dn {
		font-weight: 700;
	}

	.day-picker button.past {
		opacity: 0.6;
	}

	.day-picker button.today {
		border-color: var(--accent);
	}

	.day-picker button[aria-current='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
		opacity: 1;
	}

	.day-picker button[aria-current='true'] .wd {
		color: inherit;
	}

	@media (min-width: 960px) {
		.day-picker {
			display: none;
		}
	}

	/* ——— Tirar do congelador ——— */
	.thaw {
		margin-bottom: 16px;
		background: var(--info-soft);
		border-color: transparent;
		padding: 12px 14px;
	}

	.thaw h2 {
		font-size: 1rem;
		color: var(--info);
		margin-bottom: 8px;
	}

	.thaw ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.thaw li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: var(--surface);
		border-left: 5px solid var(--person, transparent);
	}

	.thaw .what {
		display: flex;
		flex-direction: column;
		color: inherit;
		text-decoration: none;
		min-width: 0;
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
	/* Telemóvel: um dia de cada vez, a deslizar para os lados (espreita-se o seguinte). */
	.week {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: 10px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		margin: 0 -16px;
		padding: 0 16px 4px;
		scroll-padding: 0 16px;
	}

	.week::-webkit-scrollbar {
		display: none;
	}

	.week > .day {
		flex: 0 0 calc(100% - 28px);
		min-width: 0;
		scroll-snap-align: start;
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

	.nowrap {
		white-space: nowrap;
	}

	.dm {
		color: var(--text-muted);
		font-weight: 500;
		font-size: 0.9rem;
	}

	.slot {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 6px;
		border-top: 1px dashed var(--border);
	}

	.slot.drop-over {
		outline: 2px dashed var(--accent);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.entry.dragging {
		opacity: 0.4;
	}

	.slot-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.slot-name {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.slot:not(.minor) .slot-name {
		color: var(--text);
	}

	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.entries li {
		max-width: 100%;
	}

	.entry {
		--person: var(--text-muted);
		--stripe: var(--person);
		position: relative;
		overflow: hidden;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		max-width: 100%;
		padding: 6px 12px 6px 15px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--person) 16%, var(--surface));
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
	}

	.entry::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 5px;
		background: var(--stripe);
	}

	.entry.everyone {
		--stripe: var(--both);
		background: var(--surface-2);
	}

	.slot-name .short {
		display: none;
	}

	.slot.minor .entry {
		min-height: 40px;
		font-size: 0.92rem;
	}

	.entry .title {
		overflow-wrap: anywhere;
	}

	.entry .icon:empty {
		display: none;
	}

	.entry.eaten .icon {
		color: var(--ok);
		font-weight: 800;
	}

	.entry.eaten .title {
		opacity: 0.75;
	}

	.entry.skipped {
		opacity: 0.6;
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
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 36px;
		border-radius: var(--radius-sm);
		border: 1px dashed var(--border);
		color: var(--text-muted);
		text-decoration: none;
		font-size: 1.2rem;
	}

	/* ——— Legenda e pessoa ——— */
	.legend {
		list-style: none;
		margin: -6px 0 14px;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.legend li,
	.person-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--person);
		flex: none;
	}

	.person-badge {
		--person: var(--text-muted);
		padding: 2px 10px;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 600;
		background: color-mix(in srgb, var(--person) 16%, var(--surface));
	}

	.pending li {
		border-left: 5px solid var(--person, transparent);
	}

	/* ——— Preparações ——— */
	.preps {
		border-top-style: solid;
	}

	.entry.waiting {
		background: var(--surface-2);
		color: var(--text-muted);
		filter: grayscale(0.8);
	}

	.entry.prep {
		background: transparent;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--person) 45%, var(--border));
	}

	.entry.prep.eaten {
		background: color-mix(in srgb, var(--ok) 12%, var(--surface));
	}

	.prep-part {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.prep-part h3 {
		font-size: 0.95rem;
	}

	.prep-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.prep-list li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 0 2px 10px;
		border-left: 3px solid var(--border);
		font-size: 0.92rem;
	}

	.prep-list .grow {
		flex: 1;
		min-width: 0;
	}

	.done-box summary {
		color: var(--ok);
	}

	/* ——— Painel de entrada ——— */
	.note-block h3 {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-bottom: 4px;
	}

	.note {
		margin: 0;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		white-space: pre-wrap;
	}

	.split {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 10px 12px 12px;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}

	.split legend {
		font-weight: 600;
		font-size: 0.9rem;
		padding: 0 4px;
	}

	.split-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
		gap: 8px;
		align-items: end;
	}

	.split-row.off .field span {
		color: var(--text-muted);
	}

	.split-row .join {
		grid-column: 1 / -1;
		margin: -4px 0 0;
	}

	.status-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 8px;
	}

	.status-actions .btn.chosen {
		background: var(--text);
		border-color: var(--text);
		color: var(--surface);
	}

	.status-actions .btn.ok.chosen {
		background: var(--ok);
		border-color: var(--ok);
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
			overflow: visible;
			scroll-snap-type: none;
			margin: 0;
			padding: 0;
			grid-template-columns: repeat(7, minmax(0, 1fr));
			grid-template-rows: repeat(var(--rows), auto);
			gap: 8px;
		}

		.day {
			grid-row: span var(--rows);
			display: grid;
			grid-template-rows: subgrid;
			gap: 8px;
			padding: 10px;
		}

		.day h2 {
			flex-direction: column;
			gap: 0;
		}

		.entries li,
		.entry {
			width: 100%;
		}

		.entry {
			font-size: 0.9rem;
			padding: 6px 8px 6px 12px;
		}

		.slot-name {
			font-size: 0.68rem;
		}

		.slot-name .long {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}

		.slot-name .short {
			display: inline;
		}

		.add {
			width: 36px;
			height: 30px;
		}
	}
</style>
