// Desenho das etiquetas: disposição do texto (pura, testável) e desenho num
// <canvas> a preto e branco, ao tamanho real em pontos da etiquetadora.

/** Margem à volta do texto, em pontos. */
const PAD = 4;
/** Espaço entre linhas, em pontos. */
const GAP = 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/**
 * @typedef {(text: string, size: number, bold: boolean) => number} Measure
 * @typedef {{ text: string, size: number, bold: boolean, y: number }} PlacedLine
 */

/**
 * Corta o texto com "…" até caber na largura, ao tamanho indicado.
 * @param {string} text @param {number} size @param {boolean} bold @param {number} maxWidth @param {Measure} measure
 */
export function ellipsize(text, size, bold, maxWidth, measure) {
	if (measure(text, size, bold) <= maxWidth) return text;
	let t = text;
	while (t.length > 1 && measure(`${t}…`, size, bold) > maxWidth) t = t.slice(0, -1);
	return `${t.trimEnd()}…`;
}

/**
 * Distribui o título e as linhas pela altura disponível. O título fica com
 * mais espaço; cada linha encolhe até caber na largura (até um mínimo) e só
 * depois é cortada com "…".
 * @param {import('./model.js').LabelContent} content
 * @param {{ width: number, height: number }} dots
 * @param {Measure} measure
 * @returns {PlacedLine[]}
 */
export function layoutLabel(content, dots, measure) {
	const lines = content.lines.filter(Boolean).slice(0, 2);
	const maxWidth = dots.width - PAD * 2;
	const inner = dots.height - PAD * 2 - GAP * lines.length;
	// Proporção título : linha ≈ 1,5 : 1.
	const unit = inner / (1.5 + lines.length);
	const minSize = 14;

	/** @param {string} text @param {number} start @param {boolean} bold */
	const fit = (text, start, bold) => {
		let size = Math.floor(start);
		while (size > minSize && measure(text, size, bold) > maxWidth) size--;
		return { text: ellipsize(text, size, bold, maxWidth, measure), size, bold };
	};

	// Sozinho, o título pode ocupar quase toda a altura.
	const titleMax = lines.length ? 56 : 72;
	const rows = [
		fit(content.title || '—', Math.min(unit * 1.5, titleMax), true),
		...lines.map((l) => fit(l, Math.min(unit, 28), false))
	];
	// Centra o bloco na vertical; o tamanho da letra serve de altura de linha.
	const total = rows.reduce((s, r) => s + r.size, 0) + GAP * (rows.length - 1);
	let y = Math.max(0, (dots.height - total) / 2);
	return rows.map((r) => {
		const placed = { ...r, y };
		y += r.size + GAP;
		return placed;
	});
}

/**
 * Passa a imagem a preto e branco puro (como sai na etiquetadora térmica).
 * @param {Uint8ClampedArray} rgba @param {number} [threshold]
 */
export function toMono(rgba, threshold = 160) {
	for (let i = 0; i < rgba.length; i += 4) {
		const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
		const v = rgba[i + 3] < 128 || lum >= threshold ? 255 : 0;
		rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
		rgba[i + 3] = 255;
	}
	return rgba;
}

/**
 * Desenha a etiqueta no canvas, ao tamanho real em pontos.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./model.js').LabelContent} content
 * @param {{ width: number, height: number }} dots
 */
export function drawLabel(canvas, content, dots) {
	canvas.width = dots.width;
	canvas.height = dots.height;
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
	/** @type {Measure} */
	const measure = (text, size, bold) => {
		ctx.font = `${bold ? 700 : 500} ${size}px ${FONT}`;
		return ctx.measureText(text).width;
	};
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, dots.width, dots.height);
	ctx.fillStyle = '#000';
	ctx.textBaseline = 'top';
	ctx.textAlign = 'center';
	for (const l of layoutLabel(content, dots, measure)) {
		ctx.font = `${l.bold ? 700 : 500} ${l.size}px ${FONT}`;
		ctx.fillText(l.text, dots.width / 2, l.y);
	}
	const img = ctx.getImageData(0, 0, dots.width, dots.height);
	toMono(img.data);
	ctx.putImageData(img, 0, 0);
	return canvas;
}
