import { error, redirect } from '@sveltejs/kit';
import { deleteItem, getItem, moveDoses, plannedEntriesFor, setArchived, updateItem } from '$lib/server/items.js';
import { parseItem } from '$lib/server/item-form.js';
import { guard } from '$lib/server/forms.js';
import { date, num, oneOf } from '$lib/server/validate.js';
import { LOCATIONS, labelOf } from '$lib/constants.js';
import { inventoryHref } from '$lib/inventory.js';
import { today } from '$lib/dates.js';

/** @param {string} raw */
function itemId(raw) {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) error(404, 'Item não encontrado.');
	return n;
}

/** @type {import('./$types').PageServerLoad} */
export function load({ params, url }) {
	const id = itemId(params.id);
	const item = getItem(id);
	if (!item) error(404, 'Item não encontrado.');
	return { item, entries: plannedEntriesFor(id), today: today(), back: inventoryHref(url.searchParams.get('voltar')) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: ({ request, params, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const d = parseItem(form);
			// Se a quantidade não foi mexida no formulário, mantém a atual (pode ter mudado entretanto,
			// p.ex. uma refeição marcada como comida enquanto o formulário estava aberto).
			const original = num(form, 'quantity_original', { max: 999, fallback: -1 });
			const id = itemId(params.id);
			if (original === d.quantity) d.quantity = getItem(id)?.quantity ?? d.quantity;
			if (!updateItem(id, d, locals.user.id)) error(404, 'Item não encontrado.');
			redirect(303, inventoryHref(form.get('voltar')));
		}),

	/** Passa doses para outro local (ex.: congelar parte, ou tirar uma dose do congelador). */
	move: ({ request, params, locals }) =>
		guard(
			async () => {
				const form = await request.formData();
				const id = itemId(params.id);
				const d = {
					units: num(form, 'units', { min: 0.1, max: 999, label: 'Doses' }),
					location: oneOf(form, 'location', LOCATIONS.map((l) => l.value), { label: 'Local' }),
					best_before: date(form, 'best_before', { label: 'Consumir até' })
				};
				const target = moveDoses(id, d, locals.user.id);
				if (target == null) error(404, 'Item não encontrado.');
				return {
					moved: true,
					ok: `${String(d.units).replace('.', ',')} ${d.units === 1 ? 'dose passou' : 'doses passaram'} para o ${labelOf(LOCATIONS, d.location).toLowerCase()}.`,
					target
				};
			},
			{ moved: true }
		),

	archive: async ({ request, params, locals }) => {
		const form = await request.formData();
		if (!setArchived(itemId(params.id), true, locals.user.id)) error(404, 'Item não encontrado.');
		redirect(303, inventoryHref(form.get('voltar')));
	},

	unarchive: ({ params, locals }) => {
		if (!setArchived(itemId(params.id), false, locals.user.id)) error(404, 'Item não encontrado.');
		return { ok: 'Item reposto no inventário.' };
	},

	delete: async ({ request, params }) => {
		const form = await request.formData();
		if (!deleteItem(itemId(params.id))) error(404, 'Item não encontrado.');
		const back = inventoryHref(form.get('voltar'));
		redirect(303, back.includes('arquivados') ? back : '/inventario?arquivados');
	}
};
