// Testes de ponta a ponta contra o servidor de produção (build/). Corre `npm run build` antes.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const BUILD = join(import.meta.dirname, '..', 'build', 'index.js');
const PORT = 4100 + Math.floor(Math.random() * 800);
const B = `http://localhost:${PORT}`;
const DATA = mkdtempSync(join(tmpdir(), 'marmita-http-'));

/** @type {import('node:child_process').ChildProcess | undefined} */
let server;
let cookie = '';

/**
 * Pedido como o browser o faria (Origin igual ao host, sem seguir redirects).
 * @param {string} path
 * @param {Record<string, string | string[]>} [body] envia POST de formulário
 * @param {Record<string, string>} [headers]
 */
async function req(path, body, headers = {}) {
	/** @type {RequestInit} */
	const init = { redirect: 'manual', headers: { cookie, ...headers } };
	if (body) {
		const f = new URLSearchParams();
		for (const [k, v] of Object.entries(body)) for (const x of [v].flat()) f.append(k, x);
		init.method = 'POST';
		init.body = f;
		init.headers = { origin: B, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded', ...init.headers };
	}
	return fetch(B + path, init);
}

/** Ação de formulário pedida pelo use:enhance (resposta JSON). @param {string} path @param {Record<string, string | string[]>} body */
async function action(path, body) {
	const res = await req(path, body, { accept: 'application/json', 'x-sveltekit-action': 'true' });
	return /** @type {{ type: string, status?: number, location?: string, data?: string }} */ (await res.json());
}

const q = (/** @type {string} */ sql, /** @type {any[]} */ ...a) => {
	const d = new DatabaseSync(join(DATA, 'marmita.db'), { readOnly: true });
	try {
		return /** @type {any[]} */ (d.prepare(sql).all(...a));
	} finally {
		d.close();
	}
};

describe.skipIf(!existsSync(BUILD))('servidor (build)', () => {
	beforeAll(async () => {
		server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', BUILD], {
			env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ORIGIN: B, BACKUP_KEEP: '0', TZ: 'Europe/Lisbon' },
			stdio: 'ignore'
		});
		for (let i = 0; i < 100; i++) {
			try {
				if ((await fetch(`${B}/health`)).ok) return;
			} catch {
				/* ainda a arrancar */
			}
			await new Promise((r) => setTimeout(r, 100));
		}
		throw new Error('o servidor não arrancou');
	}, 20_000);

	afterAll(() => {
		server?.kill();
	});

	test('sem contas, tudo leva ao /setup', async () => {
		expect((await req('/')).headers.get('location')).toBe('/setup');
		expect((await req('/inventario')).headers.get('location')).toBe('/setup');
		expect((await req('/health')).status).toBe(200);
	});

	test('setup cria a primeira conta e entra', async () => {
		const bad = await action('/setup', { username: 'jorge', password: 'curta', password_confirm: 'curta' });
		expect(bad.type).toBe('failure');

		const res = await req('/setup', { username: 'Jorge', display_name: 'Jorge', password: 'segredo-123', password_confirm: 'segredo-123' });
		expect(res.status).toBe(303);
		const set = res.headers.get('set-cookie') ?? '';
		expect(set).toMatch(/marmita_session=[^;]+;.*HttpOnly/i);
		expect(set).not.toMatch(/Secure/i); // http://localhost
		cookie = set.split(';')[0];
		expect((await req('/')).status).toBe(200);
	});

	test('depois do setup, /setup já não está disponível', async () => {
		expect((await req('/setup')).headers.get('location')).toBe('/');
		const anon = await fetch(`${B}/setup`, {
			method: 'POST',
			redirect: 'manual',
			headers: { origin: B, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
			body: 'username=intruso&password=segredo-123&password_confirm=segredo-123'
		});
		expect(anon.headers.get('location')).toBe('/login');
		expect(q('SELECT username FROM users').map((u) => u.username)).toEqual(['jorge']);
	});

	test('sem sessão: páginas e endpoints pedem login', async () => {
		const anon = (/** @type {string} */ p) => fetch(B + p, { redirect: 'manual' });
		expect((await anon('/inventario')).headers.get('location')).toBe('/login?next=%2Finventario');
		expect((await anon('/definicoes/backup')).status).toBe(303);
		expect((await anon('/definicoes/export')).status).toBe(303);
		expect((await anon('/ideias/1')).status).toBe(303);
	});

	test('CSRF: POST de outra origem é bloqueado, localhost e IP são aceites', async () => {
		const evil = await req('/inventario/novo', { name: 'x', quantity: '1' }, { origin: 'https://evil.example' });
		expect(evil.status).toBe(403);
		const noOrigin = await fetch(`${B}/inventario/novo`, {
			method: 'POST',
			redirect: 'manual',
			headers: { cookie, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
			body: 'name=x&quantity=1'
		});
		expect(noOrigin.status).toBe(403);
		const viaIp = await fetch(`http://127.0.0.1:${PORT}/inventario/novo`, {
			method: 'POST',
			redirect: 'manual',
			headers: { cookie, accept: 'text/html', origin: `http://127.0.0.1:${PORT}`, 'content-type': 'application/x-www-form-urlencoded' },
			body: 'name=Via+IP&quantity=1'
		});
		expect(viaIp.status).toBe(303);
	});

	test('login: erro, sucesso e next só interno', async () => {
		const wrong = await fetch(`${B}/login`, {
			method: 'POST',
			headers: { origin: B, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'x-sveltekit-action': 'true' },
			body: 'username=jorge&password=errada'
		});
		expect((await wrong.json()).type).toBe('failure');
		const ok = await fetch(`${B}/login?next=//evil.example`, {
			method: 'POST',
			redirect: 'manual',
			headers: { origin: B, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
			body: 'username=JORGE&password=segredo-123'
		});
		expect(ok.status).toBe(303);
		expect(ok.headers.get('location')).toBe('/');
		const backslash = await fetch(`${B}/login?next=/%5Cevil.example`, {
			method: 'POST',
			redirect: 'manual',
			headers: { origin: B, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
			body: 'username=jorge&password=segredo-123'
		});
		expect(backslash.headers.get('location')).toBe('/');
	});

	test('inventário → calendário → consumo', async () => {
		expect((await req('/inventario/novo', { name: 'Bacalhau', category: 'massa_arroz', location: 'congelador', quantity: '2', stored_on: '', best_before: '', notes: '' })).status).toBe(303);
		const [{ id }] = q(`SELECT id FROM items WHERE name = 'Bacalhau'`);

		const add = await action('/?/add', { w: '2026-10-12', date: '2026-10-14', slot: 'jantar', item_id: String(id), units: '0,5', notes: '', person_id: '' });
		expect(add).toMatchObject({ type: 'redirect', location: '/?w=2026-10-11' });
		const [e] = q('SELECT id, units, status FROM plan_entries WHERE item_id = ?', id);
		expect(e).toMatchObject({ units: 0.5, status: 'planned' });

		const page = await (await req('/?w=2026-10-11')).text();
		expect(page).toContain('Bacalhau');

		await action('/?/status', { w: '2026-10-11', id: String(e.id), status: 'eaten' });
		expect(q('SELECT quantity FROM items WHERE id = ?', id)[0].quantity).toBe(1.5);

		const inv = await (await req('/inventario')).text();
		expect(inv).toContain('Acompanhamento');

		// Editar o item com um formulário aberto antes da refeição ser comida não desfaz o desconto.
		const edit = { name: 'Bacalhau à Brás', category: 'peixe', location: 'congelador', quantity: '2', quantity_original: '2', stored_on: '', best_before: '', notes: '' };
		expect((await req(`/inventario/${id}?/save`, edit)).status).toBe(303);
		expect(q('SELECT name, quantity FROM items WHERE id = ?', id)[0]).toEqual({ name: 'Bacalhau à Brás', quantity: 1.5 });
		// …mas se a quantidade foi mudada no formulário, fica a nova.
		await req(`/inventario/${id}?/save`, { ...edit, quantity: '4' });
		expect(q('SELECT quantity FROM items WHERE id = ?', id)[0].quantity).toBe(4);
	});

	test('agendar uma preparação abre-a logo no painel completo', async () => {
		const r = await action('/?/prepAdd', { w: '2026-10-11', date: '2026-10-15', title: 'Filetes na airfryer', person_id: '', notes: '' });
		const [prep] = q(`SELECT id FROM preparations WHERE title = 'Filetes na airfryer'`);
		expect(r).toMatchObject({ type: 'redirect', location: `/?w=2026-10-11&preparacao=${prep.id}` });
		const html = await (await req(r.location ?? '')).text();
		expect(html).toContain('Para quando?');
		expect(html).toContain('Ingredientes do inventário');
	});

		test('mover uma preparação para outro dia (arrastar)', async () => {
		await action('/?/prepAdd', { w: '2026-10-11', date: '2026-10-12', title: 'Para arrastar', person_id: '', notes: '' });
		const [prep] = q(`SELECT id FROM preparations WHERE title = 'Para arrastar'`);
		const r = await action('/?/prepMove', { w: '2026-10-11', id: String(prep.id), date: '2026-10-16' });
		expect(r.type).toBe('redirect');
		expect(q('SELECT date FROM preparations WHERE id = ?', prep.id)[0].date).toBe('2026-10-16');
		expect((await action('/?/prepMove', { w: '2026-10-11', id: '999999', date: '2026-10-16' })).type).toBe('error');
		expect((await action('/?/prepMove', { w: '2026-10-11', id: String(prep.id), date: 'amanhã' })).type).toBe('failure');
	});

		test('confirmar uma preparação dividida por locais e mover doses no inventário', async () => {
		await action('/?/prepAdd', { w: '2026-10-11', date: '2026-10-12', title: 'Caril dividido', person_id: '', notes: '' });
		const [prep] = q(`SELECT id FROM preparations WHERE title = 'Caril dividido'`);
		const empty = await action('/?/prepDone', { w: '2026-10-11', id: String(prep.id), target: '', name: 'Caril dividido', stored_on: '2026-10-12', units_frigorifico: '0', units_congelador: '', units_despensa: '0' });
		expect(empty).toMatchObject({ type: 'failure', status: 400 });
		const ok = await action('/?/prepDone', {
			w: '2026-10-11',
			id: String(prep.id),
			target: '',
			name: 'Caril dividido',
			category: 'carne',
			stored_on: '2026-10-12',
			units_frigorifico: '3',
			best_before_frigorifico: '2026-10-15',
			units_congelador: '2',
			best_before_congelador: '',
			units_despensa: '0',
			item_notes: ''
		});
		expect(ok.type).toBe('redirect');
		const items = q(`SELECT id, location, quantity, best_before FROM items WHERE name = 'Caril dividido' ORDER BY location`);
		expect(items.map((i) => [i.location, i.quantity, i.best_before])).toEqual([
			['congelador', 2, null],
			['frigorifico', 3, '2026-10-15']
		]);
		const page = await (await req(`/?w=2026-10-11&preparacao=${prep.id}`)).text();
		expect(page).toContain('frigorífico');

		const fridge = items[1].id;
		const moved = await action(`/inventario/${fridge}?/move`, { units: '1', location: 'congelador', best_before: '' });
		expect(moved).toMatchObject({ type: 'success' });
		expect(q(`SELECT location, quantity FROM items WHERE name = 'Caril dividido' ORDER BY location`)).toEqual([
			{ location: 'congelador', quantity: 3 },
			{ location: 'frigorifico', quantity: 2 }
		]);
		expect((await action(`/inventario/${fridge}?/move`, { units: '9', location: 'congelador' })).type).toBe('failure');
	});

		test('erros de validação respondem 400 e não 500', async () => {
		const cases = [
			['/?/add', { date: 'ontem', slot: 'jantar', title: 'x' }],
			['/?/add', { date: '2026-10-14', slot: 'ceia', title: 'x' }],
			['/?/add', { date: '2026-10-14', slot: 'jantar', item_id: 'abc' }],
			['/?/add', { date: '2026-10-14', slot: 'jantar', item_id: '999999' }],
			['/?/add', { date: '2026-10-14', slot: 'jantar', title: 'x', units: '0' }],
			['/?/status', { id: 'x', status: 'eaten' }],
			['/?/status', { id: '1', status: 'roubado' }],
			['/?/prepAdd', { date: '2026-10-14', title: '' }],
			['/inventario/novo', { name: '', quantity: '1' }],
			['/inventario/novo', { name: 'x', quantity: '-1' }],
			['/ideias/nova', { title: '' }]
		];
		for (const [path, body] of /** @type {[string, Record<string, string>][]} */ (cases)) {
			const r = await action(path, body);
			expect(r.type, `${path} ${JSON.stringify(body)}`).toBe('failure');
			expect(r.status).toBe(400);
		}
	});

	test('ideias: criar, planear como preparação e mover como refeição', async () => {
		await req('/ideias/nova', { title: 'Lasanha', body: 'Forno 40 min' });
		const [idea] = q(`SELECT id FROM ideas WHERE title = 'Lasanha'`);
		const copy = await action(`/ideias/${idea.id}?/plan`, { kind: 'prep', dates: ['2026-10-15', '2026-10-16'], person_id: '' });
		expect(copy.type).toBe('success');
		expect(q(`SELECT date, notes FROM preparations WHERE title = 'Lasanha' ORDER BY date`)).toEqual([
			{ date: '2026-10-15', notes: 'Forno 40 min' },
			{ date: '2026-10-16', notes: 'Forno 40 min' }
		]);

		const move = await action(`/ideias/${idea.id}?/plan`, { kind: 'meal', dates: '2026-10-20', slot: 'almoco', person_id: '1', move: 'on' });
		expect(move).toMatchObject({ type: 'redirect', location: '/?w=2026-10-18' });
		expect(q(`SELECT date, slot, person_id, item_id FROM plan_entries WHERE title = 'Lasanha'`)).toEqual([
			{ date: '2026-10-20', slot: 'almoco', person_id: 1, item_id: null }
		]);
		expect(q('SELECT id FROM ideas WHERE id = ?', idea.id)).toEqual([]);
		expect((await req(`/ideias/${idea.id}`)).status).toBe(404);
	});

	test('descarregar a BD e exportar JSON', async () => {
		const db = await req('/definicoes/backup');
		expect(db.status).toBe(200);
		const bytes = new Uint8Array(await db.arrayBuffer());
		expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');

		await req('/definicoes'); // gera as chaves VAPID
		const json = await (await req('/definicoes/export')).json();
		expect(Object.keys(json)).toEqual(expect.arrayContaining(['items', 'plan_entries', 'preparations', 'prep_ingredients', 'ideas']));
		expect(JSON.stringify(json.settings)).not.toContain('vapid');
	});

	test('push: rejeita subscrições com chaves inválidas', async () => {
		const sub = (/** @type {string} */ p256dh, /** @type {string} */ auth) =>
			fetch(`${B}/definicoes/push`, {
				method: 'POST',
				headers: { cookie, origin: B, 'content-type': 'application/json' },
				body: JSON.stringify({ endpoint: 'https://push.example/abc', keys: { p256dh, auth } })
			});
		expect((await sub('AAAA', 'AAAA')).status).toBe(400);
		const pub = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
		expect((await sub(pub, Buffer.alloc(16, 2).toString('base64url'))).status).toBe(200);
	});

	test('páginas principais respondem sem erros e mostram a versão', async () => {
		const { version } = JSON.parse(await (await import('node:fs/promises')).readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
		for (const p of ['/', '/inventario', '/inventario/novo', '/ideias', '/ideias/nova', '/definicoes']) {
			const r = await req(p);
			expect(r.status, p).toBe(200);
			if (p === '/definicoes' || p === '/') expect(await r.text()).toContain(`v${version}`);
		}
		expect((await req('/inventario/999999')).status).toBe(404);
		expect((await req('/ideias/abc')).status).toBe(404);
	});
});
