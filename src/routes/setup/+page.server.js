import { redirect } from '@sveltejs/kit';
import { createFirstUser, createSession, cookieOptions, SESSION_COOKIE } from '$lib/server/auth.js';
import { guard } from '$lib/server/forms.js';
import { validateNewUser } from '$lib/server/users.js';

/** @type {import('./$types').Actions} */
export const actions = {
	default: ({ request, cookies, url }) =>
		guard(async () => {
			const form = await request.formData();
			const data = validateNewUser(form);
			const id = await createFirstUser(data);
			if (!id) redirect(303, '/login');
			const token = createSession(id);
			cookies.set(SESSION_COOKIE, token, cookieOptions({ request, url }));
			redirect(303, '/');
		})
};
