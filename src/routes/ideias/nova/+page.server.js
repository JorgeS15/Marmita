import { redirect } from '@sveltejs/kit';
import { createIdea } from '$lib/server/ideas.js';
import { parseIdea } from '$lib/server/idea-form.js';
import { guard } from '$lib/server/forms.js';

/** @type {import('./$types').Actions} */
export const actions = {
	default: ({ request, locals }) =>
		guard(async () => {
			const form = await request.formData();
			createIdea(parseIdea(form), locals.user.id);
			redirect(303, '/ideias');
		})
};
