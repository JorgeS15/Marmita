import { error } from '@sveltejs/kit';
import { adjustQuantity, listItems, setArchived } from '$lib/server/items.js';
import { guard } from '$lib/server/forms.js';
import { id, int } from '$lib/server/validate.js';
import { today } from '$lib/dates.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ url }) {
	const showArchived = url.searchParams.has('arquivados');
	return {
		items: listItems(),
		archived: showArchived ? listItems({ archived: true }) : [],
		showArchived,
		today: today()
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	adjust: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const delta = int(form, 'delta', { min: -1, max: 1, label: 'delta' });
			if (!adjustQuantity(id(form), delta, locals.user.id)) error(404, 'Item não encontrado.');
		}),

	archive: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			if (!setArchived(id(form), true, locals.user.id)) error(404, 'Item não encontrado.');
		}),

	unarchive: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			if (!setArchived(id(form), false, locals.user.id)) error(404, 'Item não encontrado.');
		})
};
