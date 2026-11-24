// Etiquetadora Marklife P15 (e família L11: P12, P7, LP15…) por Bluetooth LE.
//
// Protocolo e ritmo de envio a partir do thermoprint (MIT,
// https://github.com/tomLadder/thermoprint) e do hass-marklife (MIT), ambos
// testados numa P15:
//   [espessura 10 FF 10 00 TT] · acordar (15 × 00) · ligar (10 FF F1 02)
//   · bitmap 1D 76 30 00 wL wH hL hH + dados · avançar até à próxima etiqueta (1D 0C)
//   · parar (10 FF F1 45)
// Os dados vão em pacotes de até 95 bytes, um a cada 30 ms, gastando "créditos"
// que a impressora vai dando pela característica CX ([01, n]). Enviar mais
// depressa enche o buffer da impressora e ela deixa de responder.
//
// A cabeça imprime na largura do rolo (96 pontos = 12 mm). A etiqueta é
// desenhada deitada (ex.: 320 × 96) e rodada 90° para seguir o papel.

export const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const RX = '0000ff01-0000-1000-8000-00805f9b34fb'; // notificações impressora → app
const TX = '0000ff02-0000-1000-8000-00805f9b34fb'; // escrita app → impressora
const CX = '0000ff03-0000-1000-8000-00805f9b34fb'; // créditos e MTU

/** Nomes com que a P15 e os modelos compatíveis se anunciam. */
export const NAME_PREFIXES = ['P15', 'P12', 'P11', 'P7', 'LP15', 'iSPACE_LP15', 'P1s', 'S15', 'S12', 'M1', 'LPC74', 'OUT_LPC'];

const PACKET_SIZE = 95;
const TICK_MS = 30;
const STARVATION_MS = 1000;
const RESULT_TIMEOUT_MS = 30_000;

/** Densidade (escuridão) na escala da P15: 1 clara, 2 normal, 3 escura. */
export const DENSITIES = /** @type {const} */ ([
	{ value: 1, label: 'Clara' },
	{ value: 2, label: 'Normal' },
	{ value: 3, label: 'Escura' }
]);

/**
 * @typedef {{ data: Uint8Array, width: number, height: number, bytesPerRow: number }} Raster
 *   Bitmap de 1 bit por ponto, linha a linha, bit mais significativo primeiro, 1 = preto.
 */

/**
 * Converte a imagem RGBA (deitada, ex.: 320 × 96) no bitmap a enviar: rodado 90°
 * no sentido dos ponteiros do relógio (a largura passa a ser a da cabeça) ou
 * 90° no sentido contrário com `flip` (texto ao contrário no rolo).
 * @param {Uint8ClampedArray} rgba @param {number} width @param {number} height
 * @param {{ flip?: boolean, threshold?: number }} [opts]
 * @returns {Raster}
 */
export function rasterFromRGBA(rgba, width, height, opts = {}) {
	const { flip = false, threshold = 128 } = opts;
	const outW = height;
	const outH = width;
	const bytesPerRow = Math.ceil(outW / 8);
	const data = new Uint8Array(bytesPerRow * outH);
	for (let y = 0; y < outH; y++) {
		for (let x = 0; x < outW; x++) {
			// Horário: (x, y) ← origem (y, H-1-x). Anti-horário: (x, y) ← origem (W-1-y, x).
			const sx = flip ? width - 1 - y : y;
			const sy = flip ? x : height - 1 - x;
			const i = (sy * width + sx) * 4;
			const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
			if (rgba[i + 3] >= 128 && lum < threshold) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
		}
	}
	return { data, width: outW, height: outH, bytesPerRow };
}

/** @param {...(Uint8Array | number[])} parts */
function concat(...parts) {
	const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

/**
 * Bytes de um trabalho de impressão (uma etiqueta). `preamble` vai primeiro e
 * dá tempo à impressora para aquecer e devolver créditos antes do bitmap.
 * @param {Raster} raster @param {{ density?: number }} [opts]
 */
export function buildJob(raster, opts = {}) {
	const density = Math.min(3, Math.max(1, Math.round(opts.density ?? 2)));
	const { bytesPerRow, height, data } = raster;
	const preamble = concat(
		[0x10, 0xff, 0x10, 0x00, density], // espessura (a P15 usa esta em vez de 1F 70 02)
		new Uint8Array(15), // acordar
		[0x10, 0xff, 0xf1, 0x02] // ligar o motor de impressão
	);
	const bulk = concat(
		[0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff],
		data,
		[0x1d, 0x0c], // avançar até à próxima etiqueta (rolos com intervalo)
		[0x10, 0xff, 0xf1, 0x45] // fim
	);
	return { preamble, bulk };
}

const STATUS = /** @type {Record<number, string>} */ ({
	0x01: 'out_of_paper',
	0x02: 'cover_open',
	0x03: 'overheating',
	0x04: 'low_battery',
	0x05: 'cover_closed'
});

/**
 * Interpreta uma notificação da impressora.
 * @param {Uint8Array} b
 * @returns {{ type: 'success' } | { type: 'credit', value: number } | { type: 'mtu', value: number } | { type: 'status', value: string } | null}
 */
export function parseResponse(b) {
	if (!b.length) return null;
	const [first, second] = b;
	if (first === 0xaa || first === 0x4f || first === 0x4b) return { type: 'success' };
	if (b.length < 2) return null;
	if (first === 0x01) return { type: 'credit', value: second };
	if (first === 0x02 && b.length >= 3) return { type: 'mtu', value: (b[2] << 8) | second };
	if (first === 0xff) return { type: 'status', value: STATUS[second] ?? `unknown_${second.toString(16)}` };
	return null;
}

/** Mensagens para os estados que impedem a impressão. */
export const STATUS_ERRORS = /** @type {Record<string, string>} */ ({
	out_of_paper: 'A etiquetadora não tem papel.',
	cover_open: 'A tampa da etiquetadora está aberta.',
	overheating: 'A etiquetadora está demasiado quente. Espera um pouco e tenta de novo.'
});

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** O browser permite Bluetooth? (Chrome/Edge em Android, Windows, macOS, Linux; precisa de HTTPS.) */
export function bluetoothSupported() {
	return typeof navigator !== 'undefined' && 'bluetooth' in navigator && globalThis.isSecureContext !== false;
}

export class P15Printer {
	/** @type {any} */ device;
	/** @type {any} */ tx;
	credits = 0;
	lastCredit = 0;
	packetSize = PACKET_SIZE;
	usesCredits = false;
	printing = false;
	/** @type {((r: NonNullable<ReturnType<typeof parseResponse>>) => void) | null} */
	waiter = null;
	/** @type {() => void} */
	onDisconnect = () => {};

	/** @param {any} device */
	constructor(device) {
		this.device = device;
		device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
	}

	/** Abre o seletor de dispositivos do browser (tem de vir de um toque/clique). */
	static async request() {
		const nav = /** @type {any} */ (navigator);
		const device = await nav.bluetooth.requestDevice({
			filters: NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
			optionalServices: [SERVICE]
		});
		const printer = new P15Printer(device);
		await printer.connect();
		return printer;
	}

	get name() {
		return this.device?.name ?? 'Etiquetadora';
	}

	get connected() {
		return !!this.device?.gatt?.connected;
	}

	async connect() {
		const server = await this.device.gatt.connect();
		const service = await server.getPrimaryService(SERVICE);
		this.tx = await service.getCharacteristic(TX);
		/** @param {any} ch */
		const listen = async (ch) => {
			ch.addEventListener('characteristicvaluechanged', (/** @type {any} */ e) => {
				const v = e.target.value;
				this.handle(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
			});
			await ch.startNotifications();
		};
		await listen(await service.getCharacteristic(RX));
		try {
			await listen(await service.getCharacteristic(CX));
			this.usesCredits = true;
		} catch {
			this.usesCredits = false; // sem controlo de fluxo: só o ritmo de 30 ms
		}
		// A impressora dá os primeiros créditos logo a seguir à ligação.
		if (this.usesCredits) await this.waitCredits(1, 3000);
	}

	/** Volta a ligar ao mesmo dispositivo (ex.: depois de a impressora se desligar). */
	async reconnect() {
		if (this.connected) return;
		this.credits = 0;
		await this.connect();
	}

	disconnect() {
		try {
			this.device?.gatt?.disconnect();
		} catch {
			// já estava desligada
		}
	}

	/** @param {Uint8Array} bytes */
	handle(bytes) {
		const r = parseResponse(bytes);
		if (!r) return;
		if (r.type === 'credit') {
			this.credits += r.value;
			this.lastCredit = Date.now();
		} else if (r.type === 'mtu' && r.value > 3) {
			this.packetSize = Math.min(r.value - 3, PACKET_SIZE);
		}
		this.waiter?.(r);
	}

	/** @param {number} min @param {number} timeoutMs */
	async waitCredits(min, timeoutMs) {
		const end = Date.now() + timeoutMs;
		while (this.usesCredits && this.credits < min && Date.now() < end) await sleep(20);
	}

	/**
	 * Envia em pacotes, um por tick, gastando créditos.
	 * @param {Uint8Array} data @param {(sent: number) => void} [onProgress]
	 */
	async send(data, onProgress) {
		let offset = 0;
		this.lastCredit = Date.now();
		while (offset < data.length) {
			if (!this.connected) throw new Error('A etiquetadora desligou-se a meio da impressão.');
			if (this.usesCredits && this.credits <= 0) {
				if (Date.now() - this.lastCredit < STARVATION_MS) {
					await sleep(TICK_MS);
					continue;
				}
				// A impressora ficou calada: força um pacote para não ficar parado.
				this.credits = 1;
				this.lastCredit = Date.now();
			}
			const chunk = data.slice(offset, offset + this.packetSize);
			await this.tx.writeValueWithoutResponse(chunk);
			if (this.usesCredits) this.credits--;
			offset += chunk.length;
			onProgress?.(offset);
			if (offset < data.length) await sleep(TICK_MS);
		}
	}

	/** Espera pela confirmação de que a etiqueta saiu (ou por um erro). */
	waitResult() {
		return new Promise((resolve, reject) => {
			const done = (/** @type {() => void} */ fn) => {
				clearTimeout(timer);
				this.waiter = null;
				this.onDisconnect = prevDisconnect;
				fn();
			};
			const timer = setTimeout(
				() => done(() => reject(new Error('A etiquetadora não confirmou a impressão.'))),
				RESULT_TIMEOUT_MS
			);
			// Se desligar depois de receber tudo, conta como impressa (desliga-se sozinha).
			const prevDisconnect = this.onDisconnect;
			this.onDisconnect = () => {
				prevDisconnect();
				done(() => resolve(undefined));
			};
			this.waiter = (r) => {
				if (r.type === 'success') done(() => resolve(undefined));
				else if (r.type === 'status' && STATUS_ERRORS[r.value]) done(() => reject(new Error(STATUS_ERRORS[r.value])));
			};
		});
	}

	/**
	 * Imprime `copies` etiquetas iguais.
	 * @param {Raster} raster
	 * @param {{ density?: number, copies?: number, onProgress?: (done: number, total: number) => void }} [opts]
	 */
	async print(raster, opts = {}) {
		if (this.printing) throw new Error('Já está a imprimir.');
		const copies = Math.max(1, Math.floor(opts.copies ?? 1));
		const { preamble, bulk } = buildJob(raster, opts);
		const per = preamble.length + bulk.length;
		const total = per * copies;
		this.printing = true;
		try {
			await this.reconnect();
			for (let c = 0; c < copies; c++) {
				const base = c * per;
				await this.send(preamble, (s) => opts.onProgress?.(base + s, total));
				await this.waitCredits(3, 1000);
				const result = this.waitResult();
				// Evita "unhandled rejection" se o envio falhar antes da confirmação.
				result.catch(() => {});
				await this.send(bulk, (s) => opts.onProgress?.(base + preamble.length + s, total));
				await result;
			}
		} finally {
			this.printing = false;
			this.waiter = null;
		}
	}
}
