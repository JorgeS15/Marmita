import { error, redirect } from '@sveltejs/kit';
import { deleteIdea, getIdea, updateIdea } from '$lib/server/ideas.js';
import { parseIdea } from '$lib/server/idea-form.js';
import { guard } from '$lib/server/forms.js';

/** @param {string} raw */
function ideaId(raw) {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) error(404, 'Ideia não encontrada.');
	return n;
}

/** @type {import('./$types').PageServerLoad} */
export function load({ params }) {
	const idea = getIdea(ideaId(params.id));
	if (!idea) error(404, 'Ideia não encontrada.');
	return { idea };
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: ({ request, params, locals }) =>
		guard(async () => {
			const form = await request.formData();
			if (!updateIdea(ideaId(params.id), parseIdea(form), locals.user.id)) error(404, 'Ideia não encontrada.');
			return { ok: 'Guardado.' };
		}),

	delete: ({ params }) => {
		deleteIdea(ideaId(params.id));
		redirect(303, '/ideias');
	}
};
