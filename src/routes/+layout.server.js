import { getSettings } from '$lib/server/settings.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
	return { user: locals.user, settings: locals.user ? getSettings() : { morningSnack: true } };
}
