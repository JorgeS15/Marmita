import { CATEGORIES, LOCATIONS } from '$lib/constants.js';
import { date, int, oneOf, text } from './validate.js';

/** Lê e valida os campos do formulário de item. @param {FormData} form */
export function parseItem(form) {
	return {
		name: text(form, 'name', { required: true, max: 100, label: 'Nome' }),
		category: oneOf(form, 'category', CATEGORIES.map((c) => c.value), { fallback: 'outro', label: 'Categoria' }),
		location: oneOf(form, 'location', LOCATIONS.map((l) => l.value), { fallback: 'congelador', label: 'Local' }),
		quantity: int(form, 'quantity', { min: 0, max: 999, label: 'Quantidade' }),
		stored_on: date(form, 'stored_on', { label: 'Data de congelação' }),
		best_before: date(form, 'best_before', { label: 'Consumir até' }),
		notes: text(form, 'notes', { max: 1000, label: 'Notas' })
	};
}
