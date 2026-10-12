import { error, redirect } from '@sveltejs/kit';
import { deleteIdea, getIdea, updateIdea } from '$lib/server/ideas.js';
import { parseIdea } from '$lib/server/idea-form.js';
import { guard } from '$lib/server/forms.js';
import { addEntry } from '$lib/server/plan.js';
import { addPreparation } from '$lib/server/preparations.js';
import { listUsers } from '$lib/server/auth.js';
import { getSettings } from '$lib/server/settings.js';
import { ValidationError, id, oneOf } from '$lib/server/validate.js';
import { SLOT_VALUES, slotsFor } from '$lib/constants.js';
import { isISODate, nowParts, weekStartOf } from '$lib/dates.js';

/** @param {string} raw */
function ideaId(raw) {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) error(404, 'Ideia não encontrada.');
	return n;
}

/** Corta o texto ao limite dos campos de destino. @param {string} s @param {number} max */
function clip(s, max) {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** @type {import('./$types').PageServerLoad} */
export function load({ params }) {
	const idea = getIdea(ideaId(params.id));
	if (!idea) error(404, 'Ideia não encontrada.');
	const today = nowParts().date;
	return {
		idea,
		today,
		start: weekStartOf(today),
		slots: slotsFor(getSettings().morningSnack),
		users: listUsers().map((u) => ({ id: u.id, display_name: u.display_name, color: u.color }))
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: ({ request, params, locals }) =>
		guard(async () => {
			const form = await request.formData();
			if (!updateIdea(ideaId(params.id), parseIdea(form), locals.user.id)) error(404, 'Ideia não encontrada.');
			return { ok: 'Guardado.' };
		}),

	/** Copia (ou move) a ideia para refeições ou preparações nos dias escolhidos. */
	plan: ({ request, params, locals }) =>
		guard(
			async () => {
				const ideaIdNum = ideaId(params.id);
				const form = await request.formData();
				// Alterações ainda não guardadas no título/texto são guardadas primeiro.
				if (form.has('title')) updateIdea(ideaIdNum, parseIdea(form), locals.user.id);
				const idea = getIdea(ideaIdNum);
				if (!idea) error(404, 'Ideia não encontrada.');
				const kind = oneOf(form, 'kind', /** @type {const} */ (['meal', 'prep']), { label: 'Tipo' });
				const dates = [...new Set(form.getAll('dates').map(String))].sort();
				if (!dates.length) throw new ValidationError('Escolhe pelo menos um dia.');
				if (dates.length > 31 || !dates.every(isISODate)) throw new ValidationError('Dias inválidos.');
				let personId = null;
				if (form.get('person_id')) {
					personId = id(form, 'person_id');
					if (!listUsers().some((u) => u.id === personId)) throw new ValidationError('Pessoa inválida.');
				}
				const title = idea.title.slice(0, 100);
				if (kind === 'meal') {
					const slot = oneOf(form, 'slot', SLOT_VALUES, { label: 'Refeição' });
					for (const date of dates) {
						addEntry({ date, slot, item_id: null, title, units: 1, notes: clip(idea.body.replace(/\s+/g, ' ').trim(), 500), person_id: personId }, locals.user.id);
					}
				} else {
					for (const date of dates) {
						addPreparation({ date, title, notes: clip(idea.body, 2000), person_id: personId }, locals.user.id);
					}
				}
				if (form.get('move')) {
					deleteIdea(ideaIdNum);
					redirect(303, `/?w=${weekStartOf(dates[0])}`);
				}
				const what = kind === 'meal' ? 'refeição' : 'preparação';
				return { ok: dates.length === 1 ? `Adicionada como ${what}.` : `Adicionada como ${what} em ${dates.length} dias.` };
			},
			{ planning: true }
		),

	delete: ({ params }) => {
		if (!deleteIdea(ideaId(params.id))) error(404, 'Ideia não encontrada.');
		redirect(303, '/ideias');
	}
};
