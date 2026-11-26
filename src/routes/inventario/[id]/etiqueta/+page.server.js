import { error } from '@sveltejs/kit';
import { getItem } from '$lib/server/items.js';
import { inventoryHref } from '$lib/inventory.js';
import { getHaPrinter, haConfig } from '$lib/server/homeassistant.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ params, url }) {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Item não encontrado.');
	const item = getItem(id);
	if (!item) error(404, 'Item não encontrado.');
	const voltar = url.searchParams.get('voltar');
	return {
		item,
		// Volta ao item mantendo os filtros da lista.
		back: `/inventario/${id}${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`,
		list: inventoryHref(voltar),
		haConfigured: !!haConfig(),
		// Impressão pelo Home Assistant: só com HA configurado e etiquetadora escolhida.
		ha: haConfig() ? getHaPrinter() : null
	};
}
