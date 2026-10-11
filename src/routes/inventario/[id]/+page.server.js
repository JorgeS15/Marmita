import { error, redirect } from '@sveltejs/kit';
import { deleteItem, getItem, plannedEntriesFor, setArchived, updateItem } from '$lib/server/items.js';
import { parseItem } from '$lib/server/item-form.js';
import { guard } from '$lib/server/forms.js';
import { today } from '$lib/dates.js';

/** @param {string} raw */
function itemId(raw) {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) error(404, 'Item não encontrado.');
	return n;
}

/** @type {import('./$types').PageServerLoad} */
export function load({ params }) {
	const id = itemId(params.id);
	const item = getItem(id);
	if (!item) error(404, 'Item não encontrado.');
	return { item, entries: plannedEntriesFor(id), today: today() };
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: ({ request, params, locals }) =>
		guard(async () => {
			const form = await request.formData();
			if (!updateItem(itemId(params.id), parseItem(form), locals.user.id)) error(404, 'Item não encontrado.');
			redirect(303, '/inventario');
		}),

	archive: ({ params, locals }) => {
		setArchived(itemId(params.id), true, locals.user.id);
		redirect(303, '/inventario');
	},

	unarchive: ({ params, locals }) => {
		setArchived(itemId(params.id), false, locals.user.id);
		return { ok: 'Item reposto no inventário.' };
	},

	delete: ({ params }) => {
		deleteItem(itemId(params.id));
		redirect(303, '/inventario?arquivados');
	}
};
