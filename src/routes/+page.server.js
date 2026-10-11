import { error, redirect } from '@sveltejs/kit';
import { addEntry, listPending, listWeek, moveEntry, removeEntry, setStatus, updateEntry } from '$lib/server/plan.js';
import { getItem, listItems } from '$lib/server/items.js';
import { guard } from '$lib/server/forms.js';
import { ValidationError, date, id, int, oneOf, text } from '$lib/server/validate.js';
import { isISODate, mondayOf, nowParts } from '$lib/dates.js';

const SLOT_VALUES = /** @type {const} */ (['almoco', 'jantar']);
const STATUS_VALUES = /** @type {const} */ (['planned', 'eaten', 'skipped']);

/** @param {string | null} w @param {string} today */
function resolveMonday(w, today) {
	return w && isISODate(w) ? mondayOf(w) : mondayOf(today);
}

/** @type {import('./$types').PageServerLoad} */
export function load({ url }) {
	const now = nowParts();
	const monday = resolveMonday(url.searchParams.get('w'), now.date);
	return {
		monday,
		today: now.date,
		entries: listWeek(monday),
		pending: listPending(now),
		items: listItems().map((i) => ({
			id: i.id,
			name: i.name,
			category: i.category,
			location: i.location,
			stored_on: i.stored_on,
			quantity: i.quantity,
			free: i.free
		}))
	};
}

/** Volta à semana de onde veio o formulário (fecha o painel). @param {FormData} form */
function back(form) {
	const w = form.get('w');
	const monday = typeof w === 'string' && isISODate(w) ? mondayOf(w) : null;
	redirect(303, monday ? `/?w=${monday}` : '/');
}

/** @param {boolean} found */
function ensure(found) {
	if (!found) error(404, 'Entrada não encontrada.');
}

/** @type {import('./$types').Actions} */
export const actions = {
	add: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const d = date(form, 'date', { required: true, label: 'Data' });
			const slot = oneOf(form, 'slot', SLOT_VALUES, { label: 'Refeição' });
			const itemRaw = form.get('item_id');
			const item_id = itemRaw ? id(form, 'item_id') : null;
			const title = text(form, 'title', { max: 100, label: 'Texto' });
			if (item_id == null && !title) {
				throw new ValidationError('Escolhe um item do inventário ou escreve o que vais comer.');
			}
			if (item_id != null && !getItem(item_id)) throw new ValidationError('Esse item já não existe.');
			addEntry(
				{
					date: /** @type {string} */ (d),
					slot,
					item_id,
					title: item_id == null ? title : null,
					units: int(form, 'units', { min: 1, max: 99, fallback: 1, label: 'Doses' }),
					notes: text(form, 'notes', { max: 500, label: 'Nota' })
				},
				locals.user.id
			);
			back(form);
		}),

	update: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			ensure(
				updateEntry(
					id(form),
					{
						units: int(form, 'units', { min: 1, max: 99, fallback: 1, label: 'Doses' }),
						notes: text(form, 'notes', { max: 500, label: 'Nota' }),
						title: text(form, 'title', { max: 100, label: 'Texto' }) || null
					},
					locals.user.id
				)
			);
			back(form);
		}),

	move: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const d = /** @type {string} */ (date(form, 'date', { required: true, label: 'Data' }));
			const slot = oneOf(form, 'slot', SLOT_VALUES, { label: 'Refeição' });
			ensure(moveEntry(id(form), d, slot, locals.user.id));
			// Depois de mover, mostra a semana de destino.
			redirect(303, `/?w=${mondayOf(d)}`);
		}),

	status: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const status = oneOf(form, 'status', STATUS_VALUES, { label: 'Estado' });
			ensure(setStatus(id(form), status, locals.user.id));
			back(form);
		}),

	remove: ({ request }) =>
		guard(async () => {
			const form = await request.formData();
			ensure(removeEntry(id(form)));
			back(form);
		})
};
