import { describe, expect, test } from 'vitest';
import { db } from '$lib/server/db.js';
import {
	clearFailedLogins,
	cookieOptions,
	createFirstUser,
	createSession,
	createUser,
	deleteOtherSessions,
	hashPassword,
	isRateLimited,
	registerFailedLogin,
	userCount,
	validateSession,
	verifyPassword
} from '$lib/server/auth.js';

describe('palavras-passe', () => {
	test('hash e verificação', async () => {
		const h = await hashPassword('segredo-123');
		expect(h).not.toContain('segredo');
		expect(await verifyPassword('segredo-123', h)).toBe(true);
		expect(await verifyPassword('errada', h)).toBe(false);
		expect(await verifyPassword('x', 'lixo')).toBe(false);
	});
});

describe('utilizadores e sessões', () => {
	test('primeira conta só uma vez; username único sem distinguir maiúsculas', async () => {
		expect(userCount()).toBe(0);
		await createFirstUser({ username: 'Jorge', display_name: 'Jorge', password: 'segredo-123' });
		expect(userCount()).toBe(1);
		expect(await createFirstUser({ username: 'outro', display_name: 'Outro', password: 'segredo-123' })).toBeNull();
		expect(userCount()).toBe(1);
		await expect(createUser({ username: 'jorge', display_name: 'J', password: 'segredo-123' })).rejects.toThrow();
	});

	test('sessão válida, guardada só como hash, e terminar as outras', async () => {
		const id = await createUser({ username: 'filipa', display_name: 'Filipa', password: 'segredo-123' });
		const t1 = createSession(id);
		const t2 = createSession(id);
		const s1 = validateSession(t1);
		expect(s1?.user.username).toBe('filipa');
		expect(db().prepare('SELECT 1 FROM sessions WHERE id = ?').get(t1)).toBeUndefined();
		expect(validateSession('inventado')).toBeNull();

		deleteOtherSessions(id, /** @type {string} */ (s1?.sessionId));
		expect(validateSession(t1)).not.toBeNull();
		expect(validateSession(t2)).toBeNull();
	});

	test('sessão expirada é apagada; perto do fim é renovada', async () => {
		const id = await createUser({ username: 'teste', display_name: 'Teste', password: 'segredo-123' });
		const t = createSession(id);
		const sid = /** @type {string} */ (validateSession(t)?.sessionId);
		db().prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(new Date(Date.now() + 86_400_000).toISOString(), sid);
		expect(validateSession(t)?.renewed).toBe(true);
		db().prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), sid);
		expect(validateSession(t)).toBeNull();
		expect(db().prepare('SELECT 1 FROM sessions WHERE id = ?').get(sid)).toBeUndefined();
	});
});

describe('limite de tentativas', () => {
	test('bloqueia o IP ao fim de 10 falhas e limpa após login', () => {
		for (let i = 0; i < 9; i++) registerFailedLogin('1.2.3.4', 'Ana');
		expect(isRateLimited('1.2.3.4', 'ana')).toBe(false);
		registerFailedLogin('1.2.3.4', 'ana');
		expect(isRateLimited('1.2.3.4', 'ana')).toBe(true);
		// de outro IP a conta ainda não está bloqueada (só ao fim de 50)
		expect(isRateLimited('9.9.9.9', 'ANA')).toBe(false);
		clearFailedLogins('1.2.3.4', 'ana');
		expect(isRateLimited('1.2.3.4', 'ana')).toBe(false);
	});

	test('por utilizador o limite é 50 tentativas, de qualquer IP', () => {
		for (let i = 0; i < 50; i++) registerFailedLogin(`10.0.0.${i}`, 'rui');
		expect(isRateLimited('8.8.8.8', 'rui')).toBe(true);
	});
});

describe('cookie', () => {
	const ev = (/** @type {Record<string, string>} */ headers, url = 'http://localhost:4004/') => ({
		request: new Request(url, { headers }),
		url: new URL(url)
	});
	test('secure só quando o browser usa HTTPS', () => {
		expect(cookieOptions(ev({ origin: 'https://marmita.exemplo.pt' })).secure).toBe(true);
		expect(cookieOptions(ev({ origin: 'http://192.168.1.10:4004' })).secure).toBe(false);
		expect(cookieOptions(ev({ 'x-forwarded-proto': 'https' })).secure).toBe(true);
		expect(cookieOptions(ev({})).secure).toBe(false);
		expect(cookieOptions(ev({})).httpOnly).toBe(true);
	});
});
