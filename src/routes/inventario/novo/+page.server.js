import { redirect } from '@sveltejs/kit';
import { createItem } from '$lib/server/items.js';
import { parseItem } from '$lib/server/item-form.js';
import { guard } from '$lib/server/forms.js';
import { today } from '$lib/dates.js';
import { CATEGORIES, LOCATIONS } from '$lib/constants.js';
import { inventoryHref } from '$lib/inventory.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ url }) {
	const local = url.searchParams.get('local');
	const categoria = url.searchParams.get('categoria');
	return {
		today: today(),
		back: inventoryHref(url.searchParams.get('voltar')),
		defaults: {
			location: LOCATIONS.some((l) => l.value === local) ? local : 'congelador',
			category: CATEGORIES.some((c) => c.value === categoria) ? categoria : 'outro'
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			createItem(parseItem(form), locals.user.id);
			redirect(303, inventoryHref(form.get('voltar')));
		})
};
