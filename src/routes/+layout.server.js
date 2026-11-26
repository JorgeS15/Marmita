import { getSettings } from '$lib/server/settings.js';
import { env } from '$env/dynamic/private';
import { getHaPrinter, haConfig } from '$lib/server/homeassistant.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
	return {
		user: locals.user,
		settings: locals.user
			? getSettings()
			: { morningSnack: true, confirmations: true, autoConsumeFrom: '', weekStartsMonday: false },
		// Etiquetadora no Home Assistant (para imprimir etiquetas a partir de qualquer página).
		labels: locals.user
			? {
					ha: haConfig() ? getHaPrinter() : null,
					haConfigured: !!haConfig(),
					// Endereço público para o código QR (senão, o endereço por onde se abriu a app).
					origin: /^https?:\/\//.test(env.ORIGIN ?? '') ? env.ORIGIN : null
				}
			: null
	};
}
