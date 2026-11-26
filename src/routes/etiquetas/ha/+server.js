import { error, json } from '@sveltejs/kit';
import { HomeAssistantError, parseLabelRequest, printViaHa } from '$lib/server/homeassistant.js';

/**
 * Imprime uma etiqueta através do Home Assistant.
 * Corpo: { png: "data:image/png;base64,…", width, height, copies, density, flip }.
 * Só responde quando a etiqueta saiu (ou o HA devolveu erro).
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	try {
		await printViaHa(parseLabelRequest(body));
	} catch (err) {
		if (err instanceof HomeAssistantError) error(400, err.message);
		throw err;
	}
	return json({ ok: true });
}
