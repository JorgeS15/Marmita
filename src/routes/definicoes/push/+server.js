import { error, json } from '@sveltejs/kit';
import { removeSubscription, saveSubscription, sendToUser } from '$lib/server/notifications.js';

/** @param {unknown} v @param {number} max */
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * Regista este dispositivo para receber notificações.
 * Corpo: a subscrição (PushSubscription.toJSON()).
 * Com ?teste=1, envia uma notificação de teste para os dispositivos da pessoa.
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, locals, url }) {
	const userId = /** @type {NonNullable<typeof locals.user>} */ (locals.user).id;

	if (url.searchParams.has('teste')) {
		const res = await sendToUser(userId, {
			title: 'Marmita',
			body: 'As notificações estão a funcionar 👍',
			url: '/definicoes',
			tag: 'test'
		});
		return json(res);
	}

	const sub = await request.json().catch(() => null);
	if (
		!sub ||
		!str(sub.endpoint, 2000) ||
		!sub.endpoint.startsWith('https://') ||
		!str(sub.keys?.p256dh, 200) ||
		!str(sub.keys?.auth, 100)
	) {
		error(400, 'Subscrição inválida.');
	}
	saveSubscription(userId, sub, request.headers.get('user-agent') ?? '');
	return json({ ok: true });
}

/** Deixa de enviar notificações para este dispositivo. @type {import('./$types').RequestHandler} */
export async function DELETE({ request, locals }) {
	const body = await request.json().catch(() => null);
	if (!str(body?.endpoint, 2000)) error(400, 'Pedido inválido.');
	removeSubscription(/** @type {NonNullable<typeof locals.user>} */ (locals.user).id, body.endpoint);
	return json({ ok: true });
}
