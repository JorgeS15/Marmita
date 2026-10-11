import { redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	cookieOptions,
	purgeExpiredSessions,
	userCount,
	validateSession
} from '$lib/server/auth.js';

/** Rotas acessíveis sem sessão. */
const PUBLIC = ['/login', '/setup', '/health'];

let lastPurge = 0;

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	event.locals.user = null;
	event.locals.sessionId = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = validateSession(token);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = session.sessionId;
			if (session.renewed) event.cookies.set(SESSION_COOKIE, token, cookieOptions(event.url));
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	if (Date.now() - lastPurge > 3_600_000) {
		lastPurge = Date.now();
		purgeExpiredSessions();
	}

	const path = event.url.pathname;
	if (path === '/health') return resolve(event);

	const hasUsers = userCount() > 0;

	if (path === '/setup' || path.startsWith('/setup/')) {
		if (hasUsers) redirect(303, event.locals.user ? '/' : '/login');
		return resolve(event);
	}

	if (!hasUsers) redirect(303, '/setup');

	const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + '/'));
	if (!event.locals.user && !isPublic) {
		const target = path + event.url.search;
		const next = path === '/' ? '' : `?next=${encodeURIComponent(target)}`;
		redirect(303, `/login${next}`);
	}

	if (event.locals.user && path === '/login') redirect(303, '/');

	return resolve(event);
}
