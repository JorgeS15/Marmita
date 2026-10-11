import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, deleteSession } from '$lib/server/auth.js';

export function load() {
	redirect(303, '/definicoes');
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: ({ locals, cookies }) => {
		if (locals.sessionId) deleteSession(locals.sessionId);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
