// Impressão de etiquetas a partir de qualquer página: preferências do
// dispositivo (tamanho, densidade, Home Assistant ou Bluetooth…) e envio de
// uma ou várias etiquetas diferentes para a etiquetadora.

import { DEFAULT_LABEL_SIZE, LABEL_SIZES, labelDots } from './model.js';
import { drawLabel } from './render.js';
import { DENSITIES, bluetoothSupported, rasterFromRGBA } from './p15.js';
import { etiquetadora, imprimir } from './bluetooth.svelte.js';

const PREFS_KEY = 'marmita:etiqueta';

/** Preferências deste dispositivo (guardadas no browser). */
export const labelPrefs = $state({
	size: /** @type {string} */ (DEFAULT_LABEL_SIZE),
	showStored: true,
	showBestBefore: true,
	showDoses: true,
	/** Código QR que abre o item no telemóvel. */
	showQr: false,
	density: 2,
	flip: false,
	/** 'ha' = através do Home Assistant; 'bluetooth' = direto deste dispositivo. */
	method: 'ha',
	/** O browser tem Bluetooth (só se sabe depois de montar a página). */
	bluetooth: true
});

let loaded = false;

/** Lê as preferências guardadas (uma vez por carregamento da app). */
export function initLabelPrefs() {
	labelPrefs.bluetooth = bluetoothSupported();
	if (loaded) return;
	loaded = true;
	try {
		const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
		if (LABEL_SIZES.some((s) => s.value === saved.size)) labelPrefs.size = saved.size;
		for (const k of /** @type {const} */ (['showStored', 'showBestBefore', 'showDoses', 'showQr', 'flip'])) {
			if (typeof saved[k] === 'boolean') labelPrefs[k] = saved[k];
		}
		if (DENSITIES.some((d) => d.value === saved.density)) labelPrefs.density = saved.density;
		if (saved.method === 'ha' || saved.method === 'bluetooth') labelPrefs.method = saved.method;
	} catch {
		// Sem armazenamento local: ficam os valores por omissão.
	}
}

export function saveLabelPrefs() {
	const { bluetooth: _, ...prefs } = labelPrefs;
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		// Ignora (modo privado, armazenamento bloqueado).
	}
}

/**
 * Imprime pelo Home Assistant? Sim se houver etiquetadora no HA e for o método
 * escolhido, ou se o browser não tiver Bluetooth.
 * @param {{ id: string, name: string } | null | undefined} ha
 */
export function usesHa(ha) {
	return !!ha && (labelPrefs.method === 'ha' || !labelPrefs.bluetooth);
}

/** Estado da impressão em curso (partilhado pelas páginas). */
export const impressao = $state({
	busy: false,
	error: '',
	/** 0–1: parte já impressa. */
	progress: 0,
	/** Parte do total que está a ser enviada agora (para o progresso por Bluetooth). */
	share: 0,
	done: ''
});

/** Progresso total em %, contando o envio em curso por Bluetooth. */
export function progressPct() {
	const bt = impressao.busy && etiquetadora.printing ? etiquetadora.progress * impressao.share : 0;
	return Math.round(Math.min(1, impressao.progress + bt) * 100);
}

/**
 * @typedef {{ content: import('./model.js').LabelContent, copies: number }} LabelJob
 */

/** Desenha a etiqueta num canvas novo, ao tamanho escolhido. @param {import('./model.js').LabelContent} content */
export function renderCanvas(content) {
	return drawLabel(document.createElement('canvas'), content, labelDots(labelPrefs.size));
}

/** @param {HTMLCanvasElement} canvas @param {number} copies */
async function viaHa(canvas, copies) {
	let res;
	try {
		res = await fetch('/etiquetas/ha', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				png: canvas.toDataURL('image/png'),
				width: canvas.width,
				height: canvas.height,
				copies,
				density: labelPrefs.density,
				flip: labelPrefs.flip
			})
		});
	} catch {
		throw new Error('Sem ligação ao servidor do Marmita.');
	}
	if (res.ok) return;
	const body = await res.json().catch(() => null);
	throw new Error(body?.message || `Erro ${res.status} ao imprimir.`);
}

/** @param {HTMLCanvasElement} canvas @param {number} copies */
async function viaBluetooth(canvas, copies) {
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
	const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const raster = rasterFromRGBA(img.data, img.width, img.height, { flip: labelPrefs.flip });
	if (!(await imprimir(raster, { density: labelPrefs.density, copies }))) {
		throw new Error(etiquetadora.error || 'Não foi possível imprimir.');
	}
}

/**
 * Imprime várias etiquetas (cada uma com as suas cópias), umas a seguir às outras.
 * @param {LabelJob[]} jobs
 * @param {{ id: string, name: string } | null | undefined} ha etiquetadora do HA (ou null)
 * @returns {Promise<boolean>}
 */
export async function printLabels(jobs, ha) {
	const list = jobs.filter((j) => j.copies > 0);
	const total = list.reduce((n, j) => n + j.copies, 0);
	if (!total || impressao.busy) return false;
	const useHa = usesHa(ha);
	impressao.busy = true;
	impressao.error = '';
	impressao.done = '';
	impressao.progress = 0;
	let printed = 0;
	try {
		for (const job of list) {
			const canvas = renderCanvas(job.content);
			// O HA aceita até 20 cópias por pedido.
			for (let left = job.copies; left > 0; ) {
				const n = Math.min(left, 20);
				impressao.share = n / total;
				if (useHa) await viaHa(canvas, n);
				else await viaBluetooth(canvas, n);
				left -= n;
				printed += n;
				impressao.progress = printed / total;
			}
		}
		impressao.done = total === 1 ? 'Etiqueta impressa.' : `${total} etiquetas impressas.`;
		return true;
	} catch (err) {
		const msg = /** @type {Error} */ (err).message;
		impressao.error = printed ? `${msg} (${printed} de ${total} já impressas.)` : msg;
		return false;
	} finally {
		impressao.busy = false;
	}
}

/** Limpa as mensagens da última impressão (ao abrir outra página/painel). */
export function resetImpressao() {
	if (impressao.busy) return;
	impressao.error = '';
	impressao.done = '';
	impressao.progress = 0;
}

/**
 * Há uma forma de imprimir já pronta? (HA escolhido, ou Bluetooth já ligado
 * uma vez neste carregamento da app.)
 * @param {{ id: string, name: string } | null | undefined} ha
 */
export function canPrint(ha) {
	return usesHa(ha) || (labelPrefs.bluetooth && !!etiquetadora.name);
}
