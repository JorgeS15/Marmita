import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	SESSION_COOKIE,
	cookieOptions,
	purgeExpiredSessions,
	userCount,
	validateSession
} from '$lib/server/auth.js';

/** Rotas acessíveis sem sessão. */
const PUBLIC = ['/login', '/setup', '/health'];

import { startBackups } from '$lib/server/backup.js';
import { startNotifications } from '$lib/server/notifications.js';

/** Corre uma vez no arranque do servidor (não durante o build). */
export function init() {
	startBackups();
	startNotifications();
}

let lastPurge = 0;

/** Hosts extra aceites como origem de formulários (opcional, separados por vírgulas). */
const EXTRA_ORIGINS = (env.ALLOWED_ORIGINS ?? '')
	.split(',')
	.map((o) => o.trim())
	.filter(Boolean)
	.map((o) => {
		try {
			return new URL(o).host;
		} catch {
			return o;
		}
	});

/**
 * Proteção CSRF: um pedido que altera dados tem de vir de uma página servida
 * pelo mesmo host por onde chegou (Host / X-Forwarded-Host), do ORIGIN
 * configurado ou de ALLOWED_ORIGINS. Substitui a verificação do SvelteKit,
 * que só aceita exatamente o ORIGIN e por isso bloqueava http://localhost.
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
function isCrossSite(event) {
	const { method, headers } = event.request;
	if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
	const origin = headers.get('origin');
	if (!origin) return true;
	let host;
	try {
		host = new URL(origin).host;
	} catch {
		return true;
	}
	const allowed = [
		headers.get('host'),
		headers.get('x-forwarded-host')?.split(',')[0].trim(),
		event.url.host,
		...EXTRA_ORIGINS
	];
	return !allowed.includes(host);
}

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
			if (session.renewed) event.cookies.set(SESSION_COOKIE, token, cookieOptions(event));
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/', secure: cookieOptions(event).secure });
		}
	}

	if (Date.now() - lastPurge > 3_600_000) {
		lastPurge = Date.now();
		purgeExpiredSessions();
	}

	if (isCrossSite(event)) {
		return new Response('Pedido bloqueado: origem diferente da app.', { status: 403 });
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
