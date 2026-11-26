import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createServer } from 'node:http';
import {
	HomeAssistantError,
	getHaPrinter,
	haConfig,
	listPrinters,
	parseLabelRequest,
	printBody,
	printViaHa,
	printerStatus,
	setHaPrinter
} from '$lib/server/homeassistant.js';

/** PNG mínimo com as dimensões indicadas (só assinatura + IHDR: é o que se valida). @param {number} w @param {number} h */
function pngDataUrl(w, h) {
	const b = Buffer.alloc(33);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
	b.writeUInt32BE(13, 8);
	b.write('IHDR', 12, 'ascii');
	b.writeUInt32BE(w, 16);
	b.writeUInt32BE(h, 20);
	return `data:image/png;base64,${b.toString('base64')}`;
}

const valid = () => ({ png: pngDataUrl(320, 96), width: 320, height: 96, copies: 2, density: 2, flip: false });

describe('pedido de impressão do browser', () => {
	test('aceita uma etiqueta válida', () => {
		const label = parseLabelRequest(valid());
		expect(label).toMatchObject({ width: 320, height: 96, copies: 2, density: 2, flip: false });
		expect(label.png).not.toContain('data:');
	});

	test('recusa imagens e valores inválidos', () => {
		const bad = (/** @type {object} */ patch) => () => parseLabelRequest({ ...valid(), ...patch });
		expect(() => parseLabelRequest(null)).toThrow(HomeAssistantError);
		expect(bad({ png: 'data:image/jpeg;base64,AAAA' })).toThrow('Imagem inválida');
		expect(bad({ png: 'data:image/png;base64,' + Buffer.from('não é png nenhum, mas é comprido').toString('base64') })).toThrow(
			'Imagem inválida'
		);
		expect(bad({ png: 'data:image/png;base64,@@@' })).toThrow('Imagem inválida');
		expect(bad({ width: 240 })).toThrow('Tamanho'); // não bate com a imagem
		expect(bad({ png: pngDataUrl(320, 900), height: 900 })).toThrow('Tamanho');
		expect(bad({ copies: 0 })).toThrow('Cópias');
		expect(bad({ copies: 21 })).toThrow('Cópias');
		expect(bad({ density: 5 })).toThrow('Densidade');
		expect(parseLabelRequest({ ...valid(), flip: 'sim' }).flip).toBe(false);
	});

	test('corpo do marklife.print: a imagem ocupa a etiqueta e roda para seguir o papel', () => {
		const label = parseLabelRequest(valid());
		const body = printBody('dev1', label);
		expect(body).toMatchObject({
			device_id: 'dev1',
			width: 320,
			height: 96,
			rotate: 90,
			density: 2,
			copies: 2,
			paper_type: 'gap'
		});
		expect(body.payload).toEqual([
			{ type: 'dlimg', url: `data:image/png;base64,${label.png}`, x: 0, y: 0, xsize: 320, ysize: 96 }
		]);
		expect(printBody('dev1', { ...label, flip: true }).rotate).toBe(270);
	});
});

describe('Home Assistant (simulado)', () => {
	/** @type {{ path: string, auth: string, body: any }[]} */
	let calls = [];
	/** @type {(path: string) => { status: number, body: string } | null} */
	let reply = () => null;
	/** @type {import('node:http').Server} */
	let server;
	let base = '';

	beforeAll(async () => {
		server = createServer((req, res) => {
			let raw = '';
			req.on('data', (c) => (raw += c));
			req.on('end', () => {
				const path = req.url ?? '';
				calls.push({ path, auth: req.headers.authorization ?? '', body: raw ? JSON.parse(raw) : null });
				const custom = reply(path);
				if (custom) {
					res.writeHead(custom.status);
					res.end(custom.body);
				} else if (path === '/api/template') {
					res.writeHead(200);
					res.end(JSON.stringify([{ id: 'p15dev', name: 'P15 Cozinha' }, { id: 'p12dev', name: 'Arrumos' }]));
				} else if (path === '/api/services/marklife/print') {
					res.writeHead(200);
					res.end('[]');
				} else {
					res.writeHead(404);
					res.end('404: Not Found');
				}
			});
		});
		await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
		const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
		base = `http://127.0.0.1:${addr.port}`;
	});

	afterAll(() => {
		server.close();
		delete process.env.HA_URL;
		delete process.env.HA_TOKEN;
	});

	beforeEach(() => {
		calls = [];
		reply = () => null;
		process.env.HA_URL = `${base}/`;
		process.env.HA_TOKEN = 'segredo';
		setHaPrinter(null);
	});

	test('sem HA_URL/HA_TOKEN não está configurado', () => {
		delete process.env.HA_TOKEN;
		expect(haConfig()).toBe(null);
		process.env.HA_TOKEN = 'segredo';
		expect(haConfig()).toEqual({ url: base, token: 'segredo' });
	});

	test('lista as etiquetadoras Marklife (por ordem alfabética)', async () => {
		expect(await listPrinters()).toEqual([
			{ id: 'p12dev', name: 'Arrumos' },
			{ id: 'p15dev', name: 'P15 Cozinha' }
		]);
		expect(calls[0].path).toBe('/api/template');
		expect(calls[0].auth).toBe('Bearer segredo');
		expect(calls[0].body.template).toContain("integration_entities('marklife')");
	});

	test('imprime na etiquetadora escolhida', async () => {
		await expect(printViaHa(parseLabelRequest(valid()))).rejects.toThrow('Escolhe a etiquetadora');
		expect(calls).toHaveLength(0);

		setHaPrinter({ id: 'p15dev', name: 'P15 Cozinha' });
		expect(getHaPrinter()).toEqual({ id: 'p15dev', name: 'P15 Cozinha' });
		await printViaHa(parseLabelRequest(valid()));
		expect(calls[0].path).toBe('/api/services/marklife/print');
		expect(calls[0].auth).toBe('Bearer segredo');
		expect(calls[0].body).toMatchObject({ device_id: 'p15dev', rotate: 90, copies: 2 });
	});

	test('bateria e estado da etiquetadora', async () => {
		setHaPrinter({ id: 'p15dev', name: 'P15' });
		reply = (path) => (path === '/api/template' ? { status: 200, body: JSON.stringify({ battery: '80', status: 'out_of_paper' }) } : null);
		expect(await printerStatus()).toEqual({ available: true, battery: 80, problem: 'Sem papel' });
		expect(calls[0].body.variables).toEqual({ device_id: 'p15dev' });
		expect(calls[0].body.template).toContain('device_entities(device_id)');

		reply = () => ({ status: 200, body: JSON.stringify({ battery: 'unavailable', status: null }) });
		expect(await printerStatus()).toEqual({ available: false, battery: null, problem: '' });

		reply = () => ({ status: 200, body: JSON.stringify({ battery: null, status: 'cover_closed' }) });
		expect(await printerStatus()).toEqual({ available: true, battery: null, problem: '' });
	});

	test('erros do HA chegam traduzidos', async () => {
		setHaPrinter({ id: 'p15dev', name: 'P15' });
		const label = parseLabelRequest(valid());

		reply = () => ({ status: 401, body: '401: Unauthorized' });
		await expect(printViaHa(label)).rejects.toThrow('token');

		reply = () => ({ status: 400, body: 'Service marklife.print not found.' });
		await expect(printViaHa(label)).rejects.toThrow('integração Marklife');

		reply = () => ({ status: 500, body: JSON.stringify({ message: 'Failed to print: device not found' }) });
		await expect(printViaHa(label)).rejects.toThrow('Home Assistant: Failed to print: device not found');

		process.env.HA_URL = 'http://127.0.0.1:1';
		await expect(printViaHa(label)).rejects.toThrow('Não foi possível ligar ao Home Assistant');
	});
});
