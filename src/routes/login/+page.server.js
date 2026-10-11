import { fail, redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	clearFailedLogins,
	cookieOptions,
	createSession,
	dummyVerify,
	findUserByUsername,
	isRateLimited,
	registerFailedLogin,
	verifyPassword
} from '$lib/server/auth.js';
import { safeNext } from '$lib/server/forms.js';

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim().slice(0, 40);
		const password = String(form.get('password') ?? '').slice(0, 200);
		const ip = getClientAddress();

		if (!username || !password) {
			return fail(400, { username, error: 'Indica o utilizador e a palavra-passe.' });
		}
		if (isRateLimited(ip, username)) {
			return fail(429, { username, error: 'Demasiadas tentativas. Tenta novamente daqui a 15 minutos.' });
		}

		const user = findUserByUsername(username);
		const ok = user ? await verifyPassword(password, user.password_hash) : (await dummyVerify(), false);
		if (!user || !ok) {
			registerFailedLogin(ip, username);
			return fail(400, { username, error: 'Utilizador ou palavra-passe incorretos.' });
		}

		clearFailedLogins(ip, username);
		cookies.set(SESSION_COOKIE, createSession(user.id), cookieOptions({ request, url }));
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
