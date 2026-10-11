import { env } from '$env/dynamic/private';
import { db } from './db.js';
import { getRawSetting, getSettings, setSetting } from './settings.js';
import { generateVapidKeys, sendPush } from './webpush.js';
import { listPending } from './plan.js';
import { addDays, nowParts } from '$lib/dates.js';
import { slotLabel } from '$lib/constants.js';

/** Tipos de notificação, pela ordem em que aparecem nas Definições. */
export const KINDS = /** @type {const} */ (['thaw', 'preps', 'pending', 'expiry']);

/** @typedef {{ thaw: number, thaw_time: string, preps: number, preps_time: string,
 *   pending: number, pending_time: string, expiry: number, expiry_time: string }} Prefs */

// ——— VAPID ———

/** @type {{ publicKey: string, privateJwk: string, subject: string } | undefined} */
let vapidCache;

/** Chaves VAPID (geradas e guardadas na base de dados no primeiro uso). */
export function vapid() {
	if (vapidCache) return vapidCache;
	let publicKey = getRawSetting('vapid_public');
	let privateJwk = getRawSetting('vapid_private');
	if (!publicKey || !privateJwk) {
		({ publicKey, privateJwk } = generateVapidKeys());
		setSetting('vapid_public', publicKey);
		setSetting('vapid_private', privateJwk);
	}
	const origin = env.ORIGIN ?? '';
	const subject = env.VAPID_SUBJECT || (origin.startsWith('https://') ? origin : 'mailto:marmita@example.com');
	vapidCache = { publicKey, privateJwk, subject };
	return vapidCache;
}

// ——— Subscrições ———

/**
 * @param {number} userId
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} sub
 * @param {string} userAgent
 */
export function saveSubscription(userId, sub, userAgent) {
	db()
		.prepare(
			`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
			   auth = excluded.auth, user_agent = excluded.user_agent`
		)
		.run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent.slice(0, 200));
}

/** @param {number} userId @param {string} endpoint */
export function removeSubscription(userId, endpoint) {
	db().prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
}

/** @param {number} userId */
export function countSubscriptions(userId) {
	return /** @type {{ n: number }} */ (
		db().prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId)
	).n;
}

// ——— Preferências ———

/** @param {number} userId @returns {Prefs} */
export function getPrefs(userId) {
	db().prepare('INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)').run(userId);
	return /** @type {any} */ (db().prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(userId));
}

/** @param {number} userId @param {Prefs} p */
export function setPrefs(userId, p) {
	getPrefs(userId);
	db()
		.prepare(
			`UPDATE notification_prefs SET thaw = ?, thaw_time = ?, preps = ?, preps_time = ?,
			   pending = ?, pending_time = ?, expiry = ?, expiry_time = ? WHERE user_id = ?`
		)
		.run(p.thaw, p.thaw_time, p.preps, p.preps_time, p.pending, p.pending_time, p.expiry, p.expiry_time, userId);
}

// ——— Conteúdo ———

/** "A, B, C e mais 2" @param {string[]} names */
function listNames(names, max = 4) {
	if (names.length <= max) return names.join(', ');
	return `${names.slice(0, max).join(', ')} e mais ${names.length - max}`;
}

/**
 * @typedef {{ title: string, body: string, url: string, tag: string }} Message
 */

/** @type {Record<(typeof KINDS)[number], (userId: number, now: { date: string, hour: number, minute: number }) => Message | null>} */
const COMPOSERS = {
	thaw(userId, now) {
		const tomorrow = addDays(now.date, 1);
		const morning = getSettings().morningSnack;
		const rows = /** @type {{ name: string, slot: string }[]} */ (
			db()
				.prepare(
					`SELECT i.name, p.slot FROM plan_entries p JOIN items i ON i.id = p.item_id
					 WHERE p.date = ? AND p.status = 'planned' AND p.thawed = 0 AND i.location = 'congelador'
					   AND (p.person_id IS NULL OR p.person_id = ?)
					 ORDER BY p.slot`
				)
				.all(tomorrow, userId)
		);
		if (!rows.length) return null;
		return {
			title: '🧊 Tirar do congelador',
			body: `Para amanhã: ${listNames(rows.map((r) => `${r.name} (${slotLabel(r.slot, morning).toLowerCase()})`))}`,
			url: '/',
			tag: 'thaw'
		};
	},

	preps(userId, now) {
		const rows = /** @type {{ title: string }[]} */ (
			db()
				.prepare(
					`SELECT title FROM preparations
					 WHERE date = ? AND status = 'planned' AND (person_id IS NULL OR person_id = ?) ORDER BY id`
				)
				.all(addDays(now.date, 1), userId)
		);
		if (!rows.length) return null;
		return {
			title: '🍳 Preparações para amanhã',
			body: listNames(rows.map((r) => r.title)),
			url: `/?w=${addDays(now.date, 1)}`,
			tag: 'preps'
		};
	},

	pending(userId, now) {
		const rows = listPending(now).filter((e) => e.person_id == null || e.person_id === userId);
		if (!rows.length) return null;
		return {
			title: `Por confirmar (${rows.length})`,
			body: `Já comeram? ${listNames(rows.map((e) => e.title ?? ''))}`,
			url: '/',
			tag: 'pending'
		};
	},

	expiry(_userId, now) {
		const rows = /** @type {{ name: string, best_before: string }[]} */ (
			db()
				.prepare(
					`SELECT name, best_before FROM items
					 WHERE archived = 0 AND quantity > 0 AND best_before BETWEEN ? AND ? ORDER BY best_before, name`
				)
				.all(now.date, addDays(now.date, 1))
		);
		if (!rows.length) return null;
		const today = rows.filter((r) => r.best_before === now.date).map((r) => r.name);
		const tomorrow = rows.filter((r) => r.best_before !== now.date).map((r) => r.name);
		const parts = [];
		if (today.length) parts.push(`hoje: ${listNames(today)}`);
		if (tomorrow.length) parts.push(`amanhã: ${listNames(tomorrow)}`);
		return { title: '⏳ Validade a acabar', body: `Consumir até ${parts.join('; ')}`, url: '/inventario', tag: 'expiry' };
	}
};

// ——— Envio ———

/**
 * Envia a mensagem para todos os dispositivos da pessoa. Apaga subscrições expiradas.
 * @param {number} userId
 * @param {Message} message
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendToUser(userId, message) {
	const subs = /** @type {{ id: number, endpoint: string, p256dh: string, auth: string }[]} */ (
		db().prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId)
	);
	let sent = 0;
	let failed = 0;
	for (const sub of subs) {
		try {
			const res = await sendPush(sub, message, vapid(), { topic: message.tag });
			if (res.status === 404 || res.status === 410) {
				db().prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
				failed++;
			} else if (res.status >= 200 && res.status < 300) {
				db().prepare(`UPDATE push_subscriptions SET last_success_at = datetime('now') WHERE id = ?`).run(sub.id);
				sent++;
			} else {
				console.error(`[push] ${res.status} ${new URL(sub.endpoint).host}: ${res.body}`);
				failed++;
			}
		} catch (err) {
			console.error('[push] erro:', err);
			failed++;
		}
	}
	return { sent, failed };
}

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** Verifica, para cada pessoa com dispositivos, que notificações já devem ter saído hoje. */
export async function tick() {
	const now = nowParts();
	const hhmm = `${pad(now.hour)}:${pad(now.minute)}`;
	const users = /** @type {{ user_id: number }[]} */ (
		db().prepare('SELECT DISTINCT user_id FROM push_subscriptions').all()
	);
	for (const { user_id } of users) {
		const prefs = getPrefs(user_id);
		for (const kind of KINDS) {
			if (!prefs[kind] || prefs[`${kind}_time`] > hhmm) continue;
			// Regista primeiro: mesmo que não haja nada para dizer, não volta a verificar hoje.
			const res = db()
				.prepare('INSERT OR IGNORE INTO notification_log (user_id, kind, date) VALUES (?, ?, ?)')
				.run(user_id, kind, now.date);
			if (!res.changes) continue;
			const message = COMPOSERS[kind](user_id, now);
			if (message) await sendToUser(user_id, message);
		}
	}
	db().prepare('DELETE FROM notification_log WHERE date < ?').run(addDays(now.date, -7));
}

/** @type {ReturnType<typeof setInterval> | undefined} */
let timer;
let running = false;

/** Corre o agendador a cada minuto. */
export function startNotifications() {
	if (timer) return;
	const run = async () => {
		if (running) return;
		running = true;
		try {
			await tick();
		} catch (err) {
			console.error('[notificações] erro:', err);
		} finally {
			running = false;
		}
	};
	timer = setInterval(run, 60_000);
	timer.unref?.();
	setTimeout(run, 5_000).unref?.();
}
