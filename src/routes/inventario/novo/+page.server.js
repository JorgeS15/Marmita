import { redirect } from '@sveltejs/kit';
import { createItem } from '$lib/server/items.js';
import { parseItem } from '$lib/server/item-form.js';
import { guard } from '$lib/server/forms.js';
import { today } from '$lib/dates.js';

/** @type {import('./$types').PageServerLoad} */
export function load() {
	return { today: today() };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			createItem(parseItem(form), locals.user.id);
			redirect(303, '/inventario');
		})
};
