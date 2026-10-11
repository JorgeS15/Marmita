<script>
	import { CATEGORIES, LOCATIONS, labelOf, normalize } from '$lib/constants.js';
	import { agoLabel } from '$lib/dates.js';

	/**
	 * Lista de itens do inventário para escolher (rádio). Mostra as doses livres.
	 * @type {{
	 *   items: { id: number, name: string, category: string, location: string, stored_on: string | null, quantity: number, free: number }[],
	 *   today: string,
	 *   selected?: number | null
	 * }}
	 */
	let { items, today, selected = $bindable(null) } = $props();

	let q = $state('');
	const filtered = $derived.by(() => {
		const needle = normalize(q);
		const list = needle ? items.filter((i) => normalize(i.name).includes(needle)) : items;
		// Mais antigo primeiro; os sem doses livres vão para o fim.
		return [...list].sort((a, b) => Number(a.free <= 0) - Number(b.free <= 0));
	});
</script>

<div class="picker">
	<label class="visually-hidden" for="picker-q">Pesquisar no inventário</label>
	<input id="picker-q" type="search" placeholder="Pesquisar no inventário…" bind:value={q} autocomplete="off" />

	{#if items.length === 0}
		<p class="muted small">O inventário está vazio. Escreve abaixo o que vais comer.</p>
	{:else if filtered.length === 0}
		<p class="muted small">Nenhum item encontrado.</p>
	{:else}
		<ul role="radiogroup" aria-label="Itens do inventário">
			{#each filtered as item (item.id)}
				<li>
					<label class="option" class:unavailable={item.free <= 0}>
						<input type="radio" name="item_id" value={item.id} bind:group={selected} />
						<span class="text">
							<span class="name">{item.name}</span>
							<span class="muted small">
								{labelOf(CATEGORIES, item.category)} · {labelOf(LOCATIONS, item.location)}
								{#if item.stored_on}· {agoLabel(item.stored_on, today)}{/if}
							</span>
						</span>
						<span class="badge" class:ok={item.free > 0} class:danger={item.free < 0}>
							{item.free} {Math.abs(item.free) === 1 ? 'livre' : 'livres'}
						</span>
					</label>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 40dvh;
		overflow-y: auto;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.option:has(input:checked) {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.option:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 1px;
	}

	.option input {
		accent-color: var(--accent);
		width: 20px;
		height: 20px;
		flex: none;
	}

	.option.unavailable .text {
		opacity: 0.55;
	}

	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
</style>
