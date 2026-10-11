import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.js';
import { PERSON_COLORS } from '$lib/constants.js';

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;
const SESSION_DAYS = 365;
/** Renovar a sessão quando faltar menos do que isto para expirar (evita escrever a cada pedido). */
const RENEW_THRESHOLD_MS = (SESSION_DAYS - 1) * 86_400_000;

export const SESSION_COOKIE = 'marmita_session';
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;

/** @param {string} password @param {Buffer} salt @returns {Promise<Buffer>} */
function derive(password, salt) {
	return new Promise((resolve, reject) => {
		scrypt(password.normalize('NFKC'), salt, KEY_LEN, SCRYPT, (err, key) =>
			err ? reject(err) : resolve(key)
		);
	});
}

/** @param {string} password @returns {Promise<string>} "salt:hash" em hex */
export async function hashPassword(password) {
	const salt = randomBytes(16);
	const key = await derive(password, salt);
	return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/** @param {string} password @param {string} stored */
export async function verifyPassword(password, stored) {
	const [saltHex, hashHex] = stored.split(':');
	if (!saltHex || !hashHex) return false;
	const expected = Buffer.from(hashHex, 'hex');
	const key = await derive(password, Buffer.from(saltHex, 'hex'));
	return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash usado para comparar palavras-passe de utilizadores inexistentes (tempo constante). */
let dummyHash = '';
export async function dummyVerify() {
	dummyHash ||= await hashPassword('dummy-password');
	await verifyPassword('not-the-password', dummyHash);
}

/** @param {string} token */
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** @param {number} ms */
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

// ——— Utilizadores ———

/**
 * @typedef {{ id: number, username: string, display_name: string, color: string, created_at: string }} User
 */

export function userCount() {
	const row = /** @type {{ n: number }} */ (db().prepare('SELECT COUNT(*) AS n FROM users').get());
	return row.n;
}

/** @returns {User[]} */
export function listUsers() {
	return /** @type {any} */ (
		db().prepare('SELECT id, username, display_name, color, created_at FROM users ORDER BY id').all()
	);
}

/** @param {string} username */
export function findUserByUsername(username) {
	return /** @type {(User & { password_hash: string }) | undefined} */ (
		db().prepare('SELECT * FROM users WHERE username = ?').get(username)
	);
}

/** @param {number} id */
export function findUserById(id) {
	return /** @type {(User & { password_hash: string }) | undefined} */ (
		db().prepare('SELECT * FROM users WHERE id = ?').get(id)
	);
}

/**
 * @param {{ username: string, display_name: string, password: string }} data
 * @returns {Promise<number>} id do novo utilizador
 */
export async function createUser({ username, display_name, password }) {
	const hash = await hashPassword(password);
	const res = db()
		.prepare('INSERT INTO users (username, display_name, password_hash, color) VALUES (?, ?, ?, ?)')
		.run(username, display_name, hash, nextColor());
	return Number(res.lastInsertRowid);
}

/** Primeira cor da paleta ainda não usada (ou a seguinte em ciclo). */
function nextColor() {
	const used = /** @type {{ color: string }[]} */ (db().prepare('SELECT color FROM users').all()).map((u) => u.color);
	const free = PERSON_COLORS.find((c) => !used.includes(c.value));
	return (free ?? PERSON_COLORS[used.length % PERSON_COLORS.length]).value;
}

/** @param {number} userId @param {string} color */
export function setColor(userId, color) {
	db().prepare('UPDATE users SET color = ? WHERE id = ?').run(color, userId);
}

/**
 * Cria o primeiro utilizador apenas se ainda não existir nenhum (atómico).
 * @param {{ username: string, display_name: string, password: string }} data
 * @returns {Promise<number | null>}
 */
export async function createFirstUser({ username, display_name, password }) {
	const hash = await hashPassword(password);
	const res = db()
		.prepare(
			`INSERT INTO users (username, display_name, password_hash, color)
			 SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)`
		)
		.run(username, display_name, hash, PERSON_COLORS[0].value);
	return res.changes ? Number(res.lastInsertRowid) : null;
}

/** @param {number} userId @param {string} password */
export async function setPassword(userId, password) {
	const hash = await hashPassword(password);
	db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
}

/** @param {number} userId @param {string} displayName */
export function setDisplayName(userId, displayName) {
	db().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
}

// ——— Sessões ———

/** @param {number} userId @returns {string} token em claro (só vai para o cookie) */
export function createSession(userId) {
	const token = randomBytes(32).toString('base64url');
	db()
		.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
		.run(hashToken(token), userId, isoIn(SESSION_MAX_AGE * 1000));
	return token;
}

/**
 * Valida o token. Devolve o utilizador e se a sessão foi renovada.
 * @param {string} token
 * @returns {{ user: { id: number, username: string, display_name: string, color: string }, sessionId: string, renewed: boolean } | null}
 */
export function validateSession(token) {
	const sessionId = hashToken(token);
	const row = /** @type {any} */ (
		db()
			.prepare(
				`SELECT s.expires_at, u.id, u.username, u.display_name, u.color
				 FROM sessions s JOIN users u ON u.id = s.user_id
				 WHERE s.id = ?`
			)
			.get(sessionId)
	);
	if (!row) return null;

	const expires = Date.parse(row.expires_at);
	if (!(expires > Date.now())) {
		db().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
		return null;
	}

	let renewed = false;
	if (expires - Date.now() < RENEW_THRESHOLD_MS) {
		db()
			.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
			.run(isoIn(SESSION_MAX_AGE * 1000), sessionId);
		renewed = true;
	}

	return {
		user: { id: row.id, username: row.username, display_name: row.display_name, color: row.color },
		sessionId,
		renewed
	};
}

/** @param {string} sessionId hash guardado na BD */
export function deleteSession(sessionId) {
	db().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/** Termina as outras sessões do utilizador (após mudar a palavra-passe). @param {number} userId @param {string} keepSessionId */
export function deleteOtherSessions(userId, keepSessionId) {
	db().prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, keepSessionId);
}

export function purgeExpiredSessions() {
	db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

/**
 * O browser está a usar HTTPS? Usa o cabeçalho Origin (enviado em todos os POST),
 * depois X-Forwarded-Proto (reverse proxy) e, por fim, o protocolo do URL.
 * Assim a mesma instalação funciona por https://domínio, http://localhost e http://IP.
 * @param {{ request: Request, url: URL }} event
 */
function isHttps({ request, url }) {
	const origin = request.headers.get('origin');
	if (origin) return origin.startsWith('https:');
	const forwarded = request.headers.get('x-forwarded-proto');
	if (forwarded) return forwarded.split(',')[0].trim() === 'https';
	return url.protocol === 'https:';
}

/**
 * Opções do cookie de sessão. `secure` só quando o pedido chega por HTTPS,
 * senão o browser descartaria o cookie em http://IP-da-rede.
 * @param {{ request: Request, url: URL }} event
 * @returns {{ path: string, httpOnly: boolean, sameSite: 'lax', secure: boolean, maxAge: number }}
 */
export function cookieOptions(event) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isHttps(event),
		maxAge: SESSION_MAX_AGE
	};
}

// ——— Limite de tentativas de login (em memória) ———

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;
/** @type {Map<string, number[]>} */
const attempts = new Map();

/** @param {string} key */
function recent(key) {
	const now = Date.now();
	const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (list.length) attempts.set(key, list);
	else attempts.delete(key);
	return list;
}

/** @param {string} ip @param {string} username */
export function isRateLimited(ip, username) {
	return (
		recent(`ip:${ip}`).length >= MAX_ATTEMPTS ||
		recent(`user:${username.toLowerCase()}`).length >= MAX_ATTEMPTS
	);
}

/** @param {string} ip @param {string} username */
export function registerFailedLogin(ip, username) {
	for (const key of [`ip:${ip}`, `user:${username.toLowerCase()}`]) {
		const list = recent(key);
		list.push(Date.now());
		attempts.set(key, list);
	}
}

/** @param {string} ip @param {string} username */
export function clearFailedLogins(ip, username) {
	attempts.delete(`ip:${ip}`);
	attempts.delete(`user:${username.toLowerCase()}`);
}
