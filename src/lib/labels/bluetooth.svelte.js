// Ligação à etiquetadora partilhada por todas as páginas (mantém-se ao passar
// de item para item, até recarregar a app).

import { P15Printer } from './p15.js';

/** @type {P15Printer | null} */
let printer = null;

export const etiquetadora = $state({
	/** Nome anunciado (ex.: "P15_ZA15B_BLE"); vazio se nunca ligou. */
	name: '',
	connected: false,
	connecting: false,
	printing: false,
	/** 0–1 durante a impressão. */
	progress: 0,
	error: ''
});

/** @param {unknown} err */
function message(err) {
	const e = /** @type {any} */ (err);
	if (e?.name === 'NotFoundError') return ''; // fechou o seletor sem escolher
	if (e?.name === 'SecurityError') return 'O browser não deixou usar o Bluetooth (precisa de HTTPS).';
	if (e?.name === 'NetworkError') return 'Não foi possível ligar. Confirma que está ligada e que a app da Marklife está fechada.';
	return e?.message || 'Erro desconhecido.';
}

/** Escolhe a etiquetadora no seletor do browser e liga-se a ela. */
export async function ligar() {
	etiquetadora.error = '';
	etiquetadora.connecting = true;
	try {
		printer?.disconnect();
		printer = await P15Printer.request();
		printer.onDisconnect = () => (etiquetadora.connected = false);
		etiquetadora.name = printer.name;
		etiquetadora.connected = true;
	} catch (err) {
		etiquetadora.error = message(err);
	} finally {
		etiquetadora.connecting = false;
	}
}

export function desligar() {
	printer?.disconnect();
	printer = null;
	etiquetadora.connected = false;
	etiquetadora.name = '';
}

/**
 * Imprime. Se a impressora se tiver desligado entretanto, volta a ligar ao mesmo dispositivo.
 * @param {import('./p15.js').Raster} raster
 * @param {{ density?: number, copies?: number }} opts
 * @returns {Promise<boolean>}
 */
export async function imprimir(raster, opts) {
	if (!printer) return false;
	etiquetadora.error = '';
	etiquetadora.printing = true;
	etiquetadora.progress = 0;
	try {
		await printer.print(raster, { ...opts, onProgress: (done, total) => (etiquetadora.progress = done / total) });
		etiquetadora.connected = printer.connected;
		return true;
	} catch (err) {
		etiquetadora.error = message(err);
		etiquetadora.connected = printer?.connected ?? false;
		return false;
	} finally {
		etiquetadora.printing = false;
	}
}
