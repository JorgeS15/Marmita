// Conteúdo das etiquetas (o que se escreve), independente de como se imprime.
// Usado na pré-visualização, na página para imprimir/descarregar e, mais tarde,
// no envio para a etiquetadora (Bluetooth ou Home Assistant).

import { fmtNum } from '$lib/constants.js';
import { isISODate } from '$lib/dates.js';

/** Pontos por milímetro das etiquetadoras térmicas comuns (203 dpi). */
export const DOTS_PER_MM = 8;

/**
 * Tamanhos de etiqueta (comprimento × largura do rolo, em mm). A largura
 * imprimível da P15/P12 é de 96 pontos (12 mm) mesmo nos rolos de 14–15 mm.
 */
export const LABEL_SIZES = /** @type {const} */ ([
	{ value: '40x12', label: '40 × 12 mm', lengthMm: 40, widthMm: 12 },
	{ value: '30x15', label: '30 × 15 mm', lengthMm: 30, widthMm: 15 },
	{ value: '40x14', label: '40 × 14 mm', lengthMm: 40, widthMm: 14 },
	{ value: '50x15', label: '50 × 15 mm', lengthMm: 50, widthMm: 15 },
	{ value: '30x12', label: '30 × 12 mm', lengthMm: 30, widthMm: 12 }
]);

export const DEFAULT_LABEL_SIZE = '40x12';

/** Pontos imprimíveis na largura do rolo (cabeça da P15). */
export const HEAD_DOTS = 96;

/** @param {string | null | undefined} value */
export function labelSize(value) {
	return LABEL_SIZES.find((s) => s.value === value) ?? LABEL_SIZES[0];
}

/**
 * Tamanho do desenho em pontos: comprimento × largura imprimível.
 * @param {string | null | undefined} value
 */
export function labelDots(value) {
	const s = labelSize(value);
	return { width: s.lengthMm * DOTS_PER_MM, height: Math.min(s.widthMm * DOTS_PER_MM, HEAD_DOTS) };
}

/** "24/11/26" @param {string | null | undefined} iso */
export function shortDate(iso) {
	if (!iso || !isISODate(iso)) return '';
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

/** Como se chama a data de entrada em cada local. */
const STORED_PREFIX = /** @type {Record<string, string>} */ ({
	congelador: 'Cong.',
	frigorifico: 'Feito',
	despensa: 'Desde'
});

/**
 * @typedef {{ showStored?: boolean, showBestBefore?: boolean, showDoses?: boolean, doses?: number, qr?: string }} LabelOptions
 * @typedef {{ title: string, lines: string[], qr?: string }} LabelContent
 *   `qr`: texto do código QR (ex.: o endereço do item), à esquerda da etiqueta.
 * @typedef {{ key: string, units: number, label?: string,
 *   item: { id?: number | null, name: string, location: string, stored_on?: string | null, best_before?: string | null } }} LabelGroup
 *   Caixas iguais (mesmo item/local), para imprimir várias etiquetas de uma vez. `label`: nome a mostrar
 *   na lista (por omissão, o local).
 */

/**
 * Texto da etiqueta de um item: nome e até duas linhas curtas.
 * Ex.: "Arroz de pato" / "Cong. 24/11/26" / "Até 24/02/27 · 1 dose".
 * @param {{ name: string, location: string, stored_on?: string | null, best_before?: string | null }} item
 * @param {LabelOptions} [opts]
 * @returns {LabelContent}
 */
export function labelContent(item, opts = {}) {
	const { showStored = true, showBestBefore = true, showDoses = true, doses = 1 } = opts;
	const stored = showStored ? shortDate(item.stored_on) : '';
	const until = showBestBefore ? shortDate(item.best_before) : '';
	const dosesText = showDoses && doses > 0 ? `${fmtNum(doses)} ${doses <= 1 ? 'dose' : 'doses'}` : '';

	/** @type {string[]} */
	const lines = [];
	if (stored) lines.push(`${STORED_PREFIX[item.location] ?? 'Desde'} ${stored}`);
	if (until) lines.push(`Até ${until}`);
	// As doses juntam-se à última linha para caber em 2 linhas.
	if (dosesText) {
		if (lines.length) lines[lines.length - 1] += ` · ${dosesText}`;
		else lines.push(dosesText);
	}
	return { title: (item.name ?? '').trim(), lines, ...(opts.qr ? { qr: opts.qr } : {}) };
}

/**
 * Endereço curto de um item, para o código QR (abre o item ao ler com o telemóvel).
 * @param {string} origin ex.: "https://marmita.exemplo.pt" @param {number} id
 */
export function itemQrUrl(origin, id) {
	return `${origin.replace(/\/+$/, '')}/i/${id}`;
}
