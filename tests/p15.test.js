import { describe, expect, test } from 'vitest';
import { P15Printer, buildJob, parseResponse, rasterFromRGBA } from '$lib/labels/p15.js';

/** Imagem RGBA branca W×H com os pontos indicados a preto. @param {number} w @param {number} h @param {[number, number][]} black */
function rgba(w, h, black) {
	const d = new Uint8ClampedArray(w * h * 4).fill(255);
	for (const [x, y] of black) d.set([0, 0, 0, 255], (y * w + x) * 4);
	return d;
}

/** @param {import('$lib/labels/p15.js').Raster} r @param {number} x @param {number} y */
const isBlack = (r, x, y) => (r.data[y * r.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) !== 0;

describe('bitmap para a P15', () => {
	test('roda 90° no sentido horário: a altura passa a ser a largura da cabeça', () => {
		// 4 × 2, canto superior esquerdo e inferior direito a preto.
		const r = rasterFromRGBA(rgba(4, 2, [[0, 0], [3, 1]]), 4, 2);
		expect([r.width, r.height, r.bytesPerRow]).toEqual([2, 4, 1]);
		expect(isBlack(r, 1, 0)).toBe(true); // superior esquerdo → superior direito
		expect(isBlack(r, 0, 3)).toBe(true); // inferior direito → inferior esquerdo
		expect([...r.data].reduce((n, b) => n + b.toString(2).split('1').length - 1, 0)).toBe(2);
	});

	test('rodar 180° dá a rotação contrária', () => {
		const r = rasterFromRGBA(rgba(4, 2, [[0, 0]]), 4, 2, { flip: true });
		expect(isBlack(r, 0, 3)).toBe(true);
		expect(isBlack(r, 1, 0)).toBe(false);
	});

	test('etiqueta 40 × 12 mm: 96 pontos (12 bytes) por linha, 320 linhas', () => {
		const r = rasterFromRGBA(rgba(320, 96, []), 320, 96);
		expect([r.width, r.height, r.bytesPerRow, r.data.length]).toEqual([96, 320, 12, 3840]);
		expect(r.data.every((b) => b === 0)).toBe(true);
	});

	test('sequência de comandos L11', () => {
		const raster = { data: Uint8Array.from([0xff, 0x00]), width: 8, height: 2, bytesPerRow: 1 };
		const { preamble, bulk } = buildJob(raster, { density: 3 });
		expect([...preamble]).toEqual([0x10, 0xff, 0x10, 0x00, 3, ...Array(15).fill(0), 0x10, 0xff, 0xf1, 0x02]);
		expect([...bulk]).toEqual([0x1d, 0x76, 0x30, 0x00, 1, 0, 2, 0, 0xff, 0x00, 0x1d, 0x0c, 0x10, 0xff, 0xf1, 0x45]);
		expect(buildJob(raster, { density: 9 }).preamble[4]).toBe(3);
		expect(buildJob(raster).preamble[4]).toBe(2);
	});

	test('respostas da impressora', () => {
		expect(parseResponse(Uint8Array.from([0xaa]))).toEqual({ type: 'success' });
		expect(parseResponse(Uint8Array.from([0x01, 5]))).toEqual({ type: 'credit', value: 5 });
		expect(parseResponse(Uint8Array.from([0x02, 0xb7, 0x00]))).toEqual({ type: 'mtu', value: 183 });
		expect(parseResponse(Uint8Array.from([0xff, 0x01]))).toEqual({ type: 'status', value: 'out_of_paper' });
		expect(parseResponse(Uint8Array.from([0x33]))).toBe(null);
	});
});

/**
 * Impressora falsa: dá 4 créditos ao ligar e 1 por cada pacote recebido;
 * responde OK (ou outro estado) quando recebe o comando de fim.
 * @param {{ finalReply?: number[] }} [opts]
 */
function fakeDevice(opts = {}) {
	const { finalReply = [0xaa] } = opts;
	/** @type {Uint8Array[]} */
	const written = [];
	/** @type {Record<string, any>} */
	const chars = {};
	const device = /** @type {any} */ ({
		name: 'P15_TESTE_BLE',
		gatt: { connected: false },
		listeners: /** @type {Function[]} */ ([]),
		addEventListener(/** @type {string} */ _e, /** @type {Function} */ fn) {
			this.listeners.push(fn);
		}
	});
	/** @param {string} uuid */
	const makeChar = (uuid) => {
		const ch = {
			/** @type {Function[]} */ fns: [],
			addEventListener(/** @type {string} */ _e, /** @type {Function} */ fn) {
				ch.fns.push(fn);
			},
			async startNotifications() {
				if (uuid.startsWith('0000ff03')) setTimeout(() => notify(ch, [0x01, 4]), 5);
			},
			async writeValueWithoutResponse(/** @type {Uint8Array} */ chunk) {
				written.push(chunk);
				setTimeout(() => notify(chars.cx, [0x01, 1]), 1);
				if ([...chunk].join() === [0x10, 0xff, 0x50, 0xf1].join()) setTimeout(() => notify(chars.rx, [0x10, 77]), 5);
				const tail = [...chunk.slice(-4)];
				if (tail.join() === [0x10, 0xff, 0xf1, 0x45].join()) setTimeout(() => notify(chars.rx, finalReply), 5);
			}
		};
		return ch;
	};
	/** @param {any} ch @param {number[]} bytes */
	const notify = (ch, bytes) => {
		const value = new DataView(Uint8Array.from(bytes).buffer);
		for (const fn of ch.fns) fn({ target: { value } });
	};
	chars.rx = makeChar('0000ff01');
	chars.tx = makeChar('0000ff02');
	chars.cx = makeChar('0000ff03');
	device.gatt.connect = async () => {
		device.gatt.connected = true;
		return {
			getPrimaryService: async () => ({
				getCharacteristic: async (/** @type {string} */ uuid) =>
					uuid.startsWith('0000ff01') ? chars.rx : uuid.startsWith('0000ff02') ? chars.tx : chars.cx
			})
		};
	};
	device.gatt.disconnect = () => {
		device.gatt.connected = false;
		for (const fn of device.listeners) fn();
	};
	return { device, written };
}

describe('envio pela P15 (impressora simulada)', () => {
	const raster = rasterFromRGBA(rgba(160, 16, [[5, 5]]), 160, 16); // 16 × 160 → 2 B × 160 linhas

	test('envia o trabalho inteiro em pacotes de até 95 bytes e espera pelo OK', async () => {
		const { device, written } = fakeDevice();
		const p = new P15Printer(device);
		await p.connect();
		expect(p.usesCredits).toBe(true);
		/** @type {number[]} */
		const progress = [];
		await p.print(raster, { copies: 2, onProgress: (d, t) => progress.push(d / t) });

		const job = buildJob(raster);
		const one = [...job.preamble, ...job.bulk];
		const sent = written.flatMap((c) => [...c]);
		expect(sent).toEqual([...one, ...one]);
		expect(Math.max(...written.map((c) => c.length))).toBeLessThanOrEqual(95);
		expect(progress.at(-1)).toBe(1);
	});

	test('sem papel: falha com a mensagem certa', async () => {
		const { device } = fakeDevice({ finalReply: [0xff, 0x01] });
		const p = new P15Printer(device);
		await p.connect();
		await expect(p.print(raster)).rejects.toThrow('não tem papel');
		expect(p.printing).toBe(false);
	});

	test('um envio falhado não estraga a impressão seguinte', async () => {
		const { device } = fakeDevice();
		const p = new P15Printer(device);
		await p.connect();
		// O 1.º envio do bitmap falha; a impressora não responde a nada.
		const write = p.tx.writeValueWithoutResponse;
		let calls = 0;
		p.tx.writeValueWithoutResponse = async (/** @type {Uint8Array} */ c) => {
			if (++calls === 2) throw new Error('GATT operation failed');
			return write(c);
		};
		await expect(p.print(raster)).rejects.toThrow('GATT');
		expect(p.waiter).toBe(null);
		p.tx.writeValueWithoutResponse = write;
		await p.print(raster);
		expect(p.waiter).toBe(null);
	});

	test('lê a bateria', async () => {
		const { device } = fakeDevice();
		const p = new P15Printer(device);
		await p.connect();
		expect(await p.getBattery()).toBe(77);
		device.gatt.disconnect();
		expect(await p.getBattery()).toBe(null);
	});

	test('volta a ligar se a impressora se tiver desligado', async () => {
		const { device } = fakeDevice();
		const p = new P15Printer(device);
		await p.connect();
		device.gatt.disconnect();
		expect(p.connected).toBe(false);
		await p.print(raster);
		expect(p.connected).toBe(true);
	});
});
