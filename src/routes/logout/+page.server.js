import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, cookieOptions, deleteSession } from '$lib/server/auth.js';

export function load() {
	redirect(303, '/definicoes');
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: ({ locals, cookies, request, url }) => {
		if (locals.sessionId) deleteSession(locals.sessionId);
		// Com o mesmo `secure` com que foi criado, senão o browser ignora o apagar em http://IP.
		cookies.delete(SESSION_COOKIE, { path: '/', secure: cookieOptions({ request, url }).secure });
		redirect(303, '/login');
	}
};
