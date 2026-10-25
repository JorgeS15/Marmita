<script>
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import StockBadge from '$lib/components/StockBadge.svelte';
	import { CATEGORIES, LOCATIONS, labelOf, normalize } from '$lib/constants.js';
	import { itemFlags } from '$lib/stock.js';

	let { data } = $props();

	// Filtros: iniciam a partir do URL (funciona sem JS) e filtram no navegador.
	let q = $state(page.url.searchParams.get('q') ?? '');
	let location = $state(page.url.searchParams.get('local') ?? '');
	let category = $state(page.url.searchParams.get('categoria') ?? '');

	/** @param {{ name: string, notes: string, location: string, category: string }} item */
	function matches(item) {
		if (location && item.location !== location) return false;
		if (category && item.category !== category) return false;
		const needle = normalize(q);
		return !needle || normalize(item.name).includes(needle) || normalize(item.notes).includes(needle);
	}

	const filtered = $derived(data.items.filter(matches));

	/** Filtros ativos, para voltar à lista como estava depois de abrir/guardar um item. */
	const listQuery = $derived.by(() => {
		const params = new URLSearchParams();
		if (q) params.set('q', q);
		if (location) params.set('local', location);
		if (category) params.set('categoria', category);
		if (data.showArchived) params.set('arquivados', '');
		return params.toString();
	});
	const voltar = $derived(listQuery ? `voltar=${encodeURIComponent(listQuery)}` : '');
	/** @param {number} id */
	const itemHref = (id) => `/inventario/${id}${voltar ? `?${voltar}` : ''}`;

	/** O novo item herda os filtros ativos (local e categoria). */
	const newHref = $derived.by(() => {
		const params = new URLSearchParams();
		if (location) params.set('local', location);
		if (category) params.set('categoria', category);
		if (listQuery) params.set('voltar', listQuery);
		const qs = params.toString();
		return `/inventario/novo${qs ? `?${qs}` : ''}`;
	});
	const available = $derived(filtered.filter((i) => i.quantity > 0 || i.planned > 0));
	const soldOut = $derived(filtered.filter((i) => i.quantity === 0 && i.planned === 0));

	// Mantém o URL sincronizado com os filtros (sem nova navegação).
	$effect(() => {
		const params = new URLSearchParams();
		if (q) params.set('q', q);
		if (location) params.set('local', location);
		if (category) params.set('categoria', category);
		if (data.showArchived) params.set('arquivados', '');
		const search = params.toString() ? `?${params}` : '';
		if (search !== page.url.search) {
			try {
				replaceState(`/inventario${search}`, page.state);
			} catch {
				/* ainda a hidratar */
			}
		}
	});

	/** Atualiza sem fazer scroll nem limpar. */
	const quiet = () => async ({ update }) => update({ reset: false, invalidateAll: true });
</script>

<svelte:head><title>Inventário · Marmita</title></svelte:head>

{#snippet card(/** @type {(typeof data.items)[number]} */ item, /** @type {boolean} */ isSoldOut)}
	{@const flags = itemFlags(item, data.today)}
	<li class="card item">
		<a class="main" href={itemHref(item.id)}>
			<span class="name">{item.name}</span>
			<span class="meta muted small">
				{labelOf(CATEGORIES, item.category)} · {labelOf(LOCATIONS, item.location)}
				{#if flags.ageText}· {flags.ageText}{/if}
			</span>
			<span class="flags">
				<StockBadge quantity={item.quantity} planned={item.planned} free={item.free} />
				{#if flags.expired}<span class="badge danger">{flags.expiryText}</span>
				{:else if flags.expiringSoon}<span class="badge warn">{flags.expiryText}</span>{/if}
				{#if flags.old}<span class="badge warn">+3 meses</span>{/if}
			</span>
			{#if item.free < 0}
				<span class="warn-text small">Planeaste mais do que tens</span>
			{/if}
		</a>
		<div class="actions">
			{#if isSoldOut}
				<form method="POST" action="?/adjust" use:enhance={quiet}>
					<input type="hidden" name="id" value={item.id} />
					<input type="hidden" name="delta" value="1" />
					<button class="btn small">Repor</button>
				</form>
				<form method="POST" action="?/archive" use:enhance={quiet}>
					<input type="hidden" name="id" value={item.id} />
					<button class="btn small ghost">Arquivar</button>
				</form>
			{:else}
				<form method="POST" action="?/adjust" use:enhance={quiet}>
					<input type="hidden" name="id" value={item.id} />
					<input type="hidden" name="delta" value="-1" />
					<button class="btn icon" aria-label="Menos uma dose de {item.name}" disabled={item.quantity === 0}>−</button>
				</form>
				<form method="POST" action="?/adjust" use:enhance={quiet}>
					<input type="hidden" name="id" value={item.id} />
					<input type="hidden" name="delta" value="1" />
					<button class="btn icon" aria-label="Mais uma dose de {item.name}">+</button>
				</form>
			{/if}
		</div>
	</li>
{/snippet}

<main class="page narrow">
	<header class="page-header">
		<h1>Inventário</h1>
		<a class="btn primary" href={newHref}>+ Adicionar</a>
	</header>

	<form class="filters stack" method="GET" onsubmit={(e) => e.preventDefault()} role="search">
		<label class="visually-hidden" for="q">Pesquisar</label>
		<input id="q" type="search" name="q" placeholder="Pesquisar…" bind:value={q} autocomplete="off" />

		<div class="chips" role="group" aria-label="Local">
			<button type="button" class="chip" aria-pressed={location === ''} onclick={() => (location = '')}>Todos</button>
			{#each LOCATIONS as l (l.value)}
				<button
					type="button"
					class="chip"
					aria-pressed={location === l.value}
					onclick={() => (location = location === l.value ? '' : l.value)}>{l.label}</button
				>
			{/each}
		</div>
		<div class="chips" role="group" aria-label="Categoria">
			{#each CATEGORIES as c (c.value)}
				<button
					type="button"
					class="chip"
					aria-pressed={category === c.value}
					onclick={() => (category = category === c.value ? '' : c.value)}>{c.label}</button
				>
			{/each}
		</div>
	</form>

	{#if data.items.length === 0}
		<div class="card empty">
			<p>Ainda não há nada no inventário.</p>
			<a class="btn primary" href="/inventario/novo">Adicionar o primeiro item</a>
		</div>
	{:else}
		{#if available.length}
			<ul class="list">
				{#each available as item (item.id)}{@render card(item, false)}{/each}
			</ul>
		{:else}
			<p class="muted">Nenhum item corresponde aos filtros.</p>
		{/if}

		{#if soldOut.length}
			<h2 class="section">Esgotados</h2>
			<ul class="list soldout">
				{#each soldOut as item (item.id)}{@render card(item, true)}{/each}
			</ul>
		{/if}
	{/if}

	<div class="archived">
		{#if data.showArchived}
			<h2 class="section">Arquivados</h2>
			{#if data.archived.length}
				<ul class="list soldout">
					{#each data.archived as item (item.id)}
						<li class="card item">
							<a class="main" href={itemHref(item.id)}><span class="name">{item.name}</span></a>
							<form method="POST" action="?/unarchive" use:enhance={quiet}>
								<input type="hidden" name="id" value={item.id} />
								<button class="btn small">Repor</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small">Não há itens arquivados.</p>
			{/if}
			<a class="btn ghost small" href="/inventario">Esconder arquivados</a>
		{:else}
			<a class="btn ghost small" href="/inventario?arquivados">Ver arquivados</a>
		{/if}
	</div>
</main>

<style>
	.filters {
		margin-bottom: 16px;
		gap: 8px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
	}

	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: inherit;
		text-decoration: none;
	}

	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.flags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.warn-text {
		color: var(--danger);
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: none;
	}

	.actions .btn.icon {
		font-size: 1.3rem;
	}

	.soldout .item {
		opacity: 0.8;
	}

	.section {
		margin: 24px 0 10px;
		font-size: 1rem;
		color: var(--text-muted);
	}

	.empty {
		text-align: center;
	}

	.archived {
		margin-top: 24px;
		text-align: center;
	}
</style>
