<script>
	import { CATEGORIES, LOCATIONS } from '$lib/constants.js';

	/**
	 * @type {{
	 *   item?: Partial<{ name: string, category: string, location: string, quantity: number,
	 *     stored_on: string | null, best_before: string | null, notes: string }>,
	 *   today: string
	 * }}
	 */
	let { item = {}, today } = $props();
</script>

<label class="field">
	<span>Nome</span>
	<input type="text" name="name" required maxlength="100" value={item.name ?? ''} placeholder="Ex.: Peru estufado" />
</label>

<div class="grid-2">
	<label class="field">
		<span>Categoria</span>
		<select name="category" value={item.category ?? 'outro'}>
			{#each CATEGORIES as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
		</select>
	</label>
	<label class="field">
		<span>Local</span>
		<select name="location" value={item.location ?? 'congelador'}>
			{#each LOCATIONS as l (l.value)}<option value={l.value}>{l.label}</option>{/each}
		</select>
	</label>
</div>

<label class="field">
	<span>Quantidade <span class="hint">(doses/unidades)</span></span>
	<input type="number" name="quantity" required min="0" max="999" step="1" inputmode="numeric" value={item.quantity ?? 1} />
</label>

<div class="grid-2">
	<label class="field">
		<span>Congelado/preparado em</span>
		<input type="date" name="stored_on" value={item.stored_on ?? today} />
	</label>
	<label class="field">
		<span>Consumir até <span class="hint">(opcional)</span></span>
		<input type="date" name="best_before" value={item.best_before ?? ''} />
	</label>
</div>

<label class="field">
	<span>Notas</span>
	<textarea name="notes" maxlength="1000" rows="3">{item.notes ?? ''}</textarea>
</label>
