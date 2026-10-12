import { error, redirect } from '@sveltejs/kit';
import { addEntry, autoConsume, duplicateEntry, listPending, listToThaw, setIngredientThawed, setThawed, listWeek, moveEntry, removeEntry, setStatus, updateEntry } from '$lib/server/plan.js';
import { getItem, listItems } from '$lib/server/items.js';
import {
	addPreparation,
	addIngredient,
	completePreparation,
	listIngredients,
	listPrepMeals,
	removeIngredient,
	duplicatePreparation,
	listOpenPreparations,
	listWeekPreparations,
	removePreparation,
	undoPreparation,
	updatePreparation
} from '$lib/server/preparations.js';
import { guard } from '$lib/server/forms.js';
import { ValidationError, date, id, num, oneOf, text } from '$lib/server/validate.js';
import { listUsers } from '$lib/server/auth.js';
import { getSettings } from '$lib/server/settings.js';
import { CATEGORIES, LOCATIONS, SLOT_VALUES } from '$lib/constants.js';
import { addDays, isISODate, nowParts, weekStartOf } from '$lib/dates.js';

const STATUS_VALUES = /** @type {const} */ (['planned', 'eaten', 'skipped']);

/** @param {string | null} w @param {string} today */
function resolveWeekStart(w, today) {
	return weekStartOf(w && isISODate(w) ? w : today);
}

/**
 * Pessoa a quem se destina a refeição ("" = todos).
 * @param {FormData} form
 */
function person(form) {
	const raw = form.get('person_id');
	if (!raw) return null;
	const pid = id(form, 'person_id');
	if (!listUsers().some((u) => u.id === pid)) throw new ValidationError('Pessoa inválida.');
	return pid;
}

/** @type {import('./$types').PageServerLoad} */
export function load({ url }) {
	const now = nowParts();
	const start = resolveWeekStart(url.searchParams.get('w'), now.date);
	const settings = getSettings();
	if (!settings.confirmations) autoConsume(now);
	const preparations = listWeekPreparations(start);
	const prepIds = preparations.map((p) => p.id);
	return {
		start,
		today: now.date,
		users: listUsers().map((u) => ({ id: u.id, display_name: u.display_name, color: u.color })),
		entries: listWeek(start),
		preparations,
		ingredients: listIngredients(prepIds),
		prepMeals: listPrepMeals(prepIds),
		openPreps: listOpenPreparations(addDays(now.date, -14)),
		toThaw: listToThaw(now.date),
		pending: settings.confirmations ? listPending(now) : [],
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
	const prep = Number(form.get('prep'));
	if (prep > 0) backToPrep(form, prep);
	const w = form.get('w');
	const start = typeof w === 'string' && isISODate(w) ? weekStartOf(w) : null;
	redirect(303, start ? `/?w=${start}` : '/');
}

/** Dias escolhidos para duplicar (checkboxes "dates"). @param {FormData} form */
function targetDates(form) {
	const dates = [...new Set(form.getAll('dates').map(String))];
	if (!dates.length) throw new ValidationError('Escolhe pelo menos um dia.');
	if (dates.length > 31 || !dates.every(isISODate)) throw new ValidationError('Dias inválidos.');
	return dates;
}

/** @param {FormData} form */
function parsePrep(form) {
	return {
		date: /** @type {string} */ (date(form, 'date', { required: true, label: 'Data' })),
		title: text(form, 'title', { required: true, max: 100, label: 'Preparação' }),
		notes: text(form, 'notes', { max: 2000, label: 'Notas' }),
		person_id: person(form)
	};
}

/** Volta ao painel da preparação (sem o fechar). @param {FormData} form @param {number} prepId */
function backToPrep(form, prepId) {
	const w = form.get('w');
	const start = typeof w === 'string' && isISODate(w) ? weekStartOf(w) : null;
	redirect(303, `/?${start ? `w=${start}&` : ''}preparacao=${prepId}`);
}

/** @param {boolean} found @param {string} [what] */
function ensure(found, what = 'Entrada não encontrada.') {
	if (!found) error(404, what);
}

/** @type {import('./$types').Actions} */
export const actions = {
	add: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const d = date(form, 'date', { required: true, label: 'Data' });
			const slot = oneOf(form, 'slot', SLOT_VALUES, { label: 'Refeição' });
			// item_id: id de um item do inventário, ou "p<id>" para uma preparação ainda por fazer.
			const itemRaw = String(form.get('item_id') ?? '');
			const prepMatch = /^p(\d+)$/.exec(itemRaw);
			const prep_id = prepMatch ? Number(prepMatch[1]) : null;
			const item_id = itemRaw && !prepMatch ? id(form, 'item_id') : null;
			const title = text(form, 'title', { max: 100, label: 'Texto' });
			if (item_id == null && prep_id == null && !title) {
				throw new ValidationError('Escolhe um item do inventário ou escreve o que vais comer.');
			}
			if (item_id != null && !getItem(item_id)) throw new ValidationError('Esse item já não existe.');
			addEntry(
				{
					date: /** @type {string} */ (d),
					slot,
					item_id,
					prep_id,
					title: item_id == null ? title : null,
					units: num(form, 'units', { min: 0.1, max: 99, fallback: 1, label: 'Doses' }),
					notes: text(form, 'notes', { max: 500, label: 'Nota' }),
					person_id: person(form)
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
						units: num(form, 'units', { min: 0.1, max: 99, fallback: 1, label: 'Doses' }),
						notes: text(form, 'notes', { max: 500, label: 'Nota' }),
						person_id: person(form),
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
			redirect(303, `/?w=${weekStartOf(d)}`);
		}),

	duplicate: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const slot = oneOf(form, 'slot', SLOT_VALUES, { label: 'Refeição' });
			ensure(duplicateEntry(id(form), targetDates(form), slot, locals.user.id) > 0);
			back(form);
		}),

	prepDuplicate: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			ensure(duplicatePreparation(id(form), targetDates(form), locals.user.id) > 0, 'Preparação não encontrada.');
			back(form);
		}),

	thaw: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const thawed = form.get('undo') !== '1';
			const ok =
				form.get('kind') === 'ingredient'
					? setIngredientThawed(id(form), thawed)
					: setThawed(id(form), thawed, locals.user.id);
			ensure(ok);
			back(form);
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
		}),

	// ——— Preparações ———

	prepAdd: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			addPreparation(parsePrep(form), locals.user.id);
			back(form);
		}),

	prepUpdate: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const d = parsePrep(form);
			ensure(updatePreparation(id(form), d, locals.user.id), 'Preparação não encontrada.');
			redirect(303, `/?w=${weekStartOf(d.date)}`);
		}),

	prepRemove: ({ request }) =>
		guard(async () => {
			const form = await request.formData();
			ensure(removePreparation(id(form)), 'Preparação não encontrada.');
			back(form);
		}),

	prepDone: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const targetRaw = form.get('target');
			/** @type {number | null | 'none'} */
			const target = targetRaw === 'none' ? 'none' : targetRaw ? id(form, 'target') : null;
			if (typeof target === 'number' && !getItem(target)) throw new ValidationError('Esse item já não existe.');
			ensure(
				completePreparation(
					id(form),
					{
						units: target === 'none' ? 0 : num(form, 'units', { min: 0.1, max: 999, label: 'Doses' }),
						target,
						name: text(form, 'name', { required: target == null, max: 100, label: 'Nome' }),
						category: oneOf(form, 'category', CATEGORIES.map((c) => c.value), { fallback: 'outro', label: 'Categoria' }),
						location: oneOf(form, 'location', LOCATIONS.map((l) => l.value), { fallback: 'congelador', label: 'Local' }),
						stored_on: /** @type {string} */ (date(form, 'stored_on', { required: target !== 'none', label: 'Data' })),
						best_before: date(form, 'best_before', { label: 'Consumir até' }),
						notes: text(form, 'item_notes', { max: 1000, label: 'Notas' })
					},
					locals.user.id
				),
				'Preparação não encontrada ou já confirmada.'
			);
			back(form);
		}),

	prepMeal: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			const prepId = id(form);
			addEntry(
				{
					date: /** @type {string} */ (date(form, 'date', { required: true, label: 'Dia' })),
					slot: oneOf(form, 'slot', SLOT_VALUES, { label: 'Refeição' }),
					item_id: null,
					prep_id: prepId,
					title: null,
					units: num(form, 'units', { min: 0.1, max: 99, fallback: 1, label: 'Doses' }),
					notes: '',
					person_id: person(form)
				},
				locals.user.id
			);
			backToPrep(form, prepId);
		}),

	prepIngredientAdd: ({ request }) =>
		guard(async () => {
			const form = await request.formData();
			const prepId = id(form);
			const itemId = id(form, 'item_id');
			if (!getItem(itemId)) throw new ValidationError('Esse item já não existe.');
			const units = num(form, 'units', { min: 0.1, max: 999, fallback: 1, label: 'Doses' });
			ensure(addIngredient(prepId, itemId, units), 'Preparação não encontrada ou já feita.');
			backToPrep(form, prepId);
		}),

	prepIngredientRemove: ({ request }) =>
		guard(async () => {
			const form = await request.formData();
			ensure(removeIngredient(id(form, 'ingredient_id')), 'Ingrediente não encontrado.');
			backToPrep(form, id(form));
		}),

	prepUndo: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			ensure(undoPreparation(id(form), locals.user.id), 'Preparação não encontrada.');
			back(form);
		})
};
