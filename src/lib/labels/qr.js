// Gerador de códigos QR sem dependências (ISO/IEC 18004), só o necessário para
// as etiquetas: texto em modo byte (UTF-8), versões 1 a 6, correção de erros
// M (ou L, se não couber). Devolve a matriz de módulos (true = preto).
//
// Segue a estrutura habitual dos geradores de referência (ex.: o de Project
// Nayuki, MIT): codificação dos dados, Reed–Solomon em GF(256), entrelaçamento
// dos blocos, padrões fixos, colocação em zigue-zague e escolha da máscara com
// menor penalização.

const MAX_VERSION = 6;

/** Nível de correção → [bits do formato, codewords de correção por bloco (v1..6), nº de blocos (v1..6)]. */
const ECL = /** @type {const} */ ({
	L: { format: 1, ecc: [7, 10, 15, 20, 26, 18], blocks: [1, 1, 1, 1, 1, 2] },
	M: { format: 0, ecc: [10, 16, 26, 18, 24, 16], blocks: [1, 1, 1, 2, 2, 4] }
});

/** Módulos disponíveis para dados (sem padrões fixos) numa versão. @param {number} ver */
function rawDataModules(ver) {
	let result = (16 * ver + 128) * ver + 64;
	if (ver >= 2) {
		const numAlign = Math.floor(ver / 7) + 2;
		result -= (25 * numAlign - 10) * numAlign - 55;
	}
	return result;
}

/** @param {number} ver @param {'L' | 'M'} ecl */
function dataCodewords(ver, ecl) {
	return Math.floor(rawDataModules(ver) / 8) - ECL[ecl].ecc[ver - 1] * ECL[ecl].blocks[ver - 1];
}

// ——— Reed–Solomon em GF(2^8), polinómio 0x11D ———

/** @param {number} x @param {number} y */
function gfMul(x, y) {
	let z = 0;
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * 0x11d);
		z ^= ((y >>> i) & 1) * x;
	}
	return z & 0xff;
}

/** Polinómio gerador de grau `degree`. @param {number} degree */
function rsDivisor(degree) {
	const result = new Array(degree).fill(0);
	result[degree - 1] = 1;
	let root = 1;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < result.length; j++) {
			result[j] = gfMul(result[j], root);
			if (j + 1 < result.length) result[j] ^= result[j + 1];
		}
		root = gfMul(root, 0x02);
	}
	return result;
}

/** Resto da divisão (os codewords de correção). @param {number[]} data @param {number[]} divisor */
function rsRemainder(data, divisor) {
	const result = new Array(divisor.length).fill(0);
	for (const b of data) {
		const factor = b ^ /** @type {number} */ (result.shift());
		result.push(0);
		divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
	}
	return result;
}

// ——— Codificação ———

/**
 * Bits dos dados (modo byte) com terminador e enchimento, em bytes.
 * @param {Uint8Array} bytes @param {number} ver @param {'L' | 'M'} ecl
 */
function encodeData(bytes, ver, ecl) {
	/** @type {number[]} */
	const bits = [];
	const push = (/** @type {number} */ val, /** @type {number} */ len) => {
		for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
	};
	push(0b0100, 4); // modo byte
	push(bytes.length, 8); // contagem (8 bits nas versões 1–9)
	for (const b of bytes) push(b, 8);
	const capacity = dataCodewords(ver, ecl) * 8;
	push(0, Math.min(4, capacity - bits.length));
	push(0, (8 - (bits.length % 8)) % 8);
	for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
	/** @type {number[]} */
	const out = [];
	for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
	return out;
}

/** Divide em blocos, junta a correção de erros e entrelaça. @param {number[]} data @param {number} ver @param {'L' | 'M'} ecl */
function addEccAndInterleave(data, ver, ecl) {
	const numBlocks = ECL[ecl].blocks[ver - 1];
	const eccLen = ECL[ecl].ecc[ver - 1];
	const rawCodewords = Math.floor(rawDataModules(ver) / 8);
	const numShort = numBlocks - (rawCodewords % numBlocks);
	const shortLen = Math.floor(rawCodewords / numBlocks);
	const divisor = rsDivisor(eccLen);
	/** @type {number[][]} */
	const blocks = [];
	for (let i = 0, k = 0; i < numBlocks; i++) {
		const len = shortLen - eccLen + (i < numShort ? 0 : 1);
		const dat = data.slice(k, k + len);
		k += len;
		const ecc = rsRemainder(dat, divisor);
		if (i < numShort) dat.push(0); // posição vazia, ignorada ao entrelaçar
		blocks.push([...dat, ...ecc]);
	}
	/** @type {number[]} */
	const result = [];
	for (let i = 0; i < blocks[0].length; i++) {
		blocks.forEach((block, j) => {
			if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]);
		});
	}
	return result;
}

// ——— Matriz ———

/** @param {number} ver */
function alignmentPositions(ver) {
	if (ver === 1) return [];
	const size = ver * 4 + 17;
	const numAlign = Math.floor(ver / 7) + 2;
	const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
	const result = [6];
	for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
	return result;
}

class Matrix {
	/** @param {number} ver */
	constructor(ver) {
		this.size = ver * 4 + 17;
		/** @type {boolean[][]} */
		this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
		/** @type {boolean[][]} */
		this.fixed = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
	}

	/** @param {number} x @param {number} y @param {boolean} dark */
	setFixed(x, y, dark) {
		this.modules[y][x] = dark;
		this.fixed[y][x] = true;
	}

	/** @param {number} cx @param {number} cy */
	finder(cx, cy) {
		for (let dy = -4; dy <= 4; dy++) {
			for (let dx = -4; dx <= 4; dx++) {
				const x = cx + dx;
				const y = cy + dy;
				const d = Math.max(Math.abs(dx), Math.abs(dy));
				if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.setFixed(x, y, d !== 2 && d !== 4);
			}
		}
	}

	/** @param {number} cx @param {number} cy */
	alignment(cx, cy) {
		for (let dy = -2; dy <= 2; dy++) {
			for (let dx = -2; dx <= 2; dx++) this.setFixed(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
		}
	}

	/** @param {'L' | 'M'} ecl @param {number} mask */
	format(ecl, mask) {
		const data = (ECL[ecl].format << 3) | mask;
		let rem = data;
		for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
		const bits = ((data << 10) | rem) ^ 0x5412;
		const bit = (/** @type {number} */ i) => ((bits >>> i) & 1) === 1;
		const n = this.size;
		for (let i = 0; i <= 5; i++) this.setFixed(8, i, bit(i));
		this.setFixed(8, 7, bit(6));
		this.setFixed(8, 8, bit(7));
		this.setFixed(7, 8, bit(8));
		for (let i = 9; i < 15; i++) this.setFixed(14 - i, 8, bit(i));
		for (let i = 0; i < 8; i++) this.setFixed(n - 1 - i, 8, bit(i));
		for (let i = 8; i < 15; i++) this.setFixed(8, n - 15 + i, bit(i));
		this.setFixed(8, n - 8, true); // módulo escuro fixo
	}
}

/** @param {number} mask @param {number} x @param {number} y */
function maskBit(mask, x, y) {
	switch (mask) {
		case 0: return (x + y) % 2 === 0;
		case 1: return y % 2 === 0;
		case 2: return x % 3 === 0;
		case 3: return (x + y) % 3 === 0;
		case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
		case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
		case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
		default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
	}
}

/** Penalização da máscara (regras N1–N4 da norma). @param {boolean[][]} m */
export function penalty(m) {
	const n = m.length;
	let score = 0;
	const lines = [...m, ...m[0].map((_, x) => m.map((row) => row[x]))];
	for (const line of lines) {
		// N1: 5 ou mais módulos seguidos da mesma cor.
		for (let i = 0, run = 1; i < n; i++, run++) {
			if (i === n - 1 || line[i + 1] !== line[i]) {
				if (run >= 5) score += run - 2;
				run = 0;
			}
		}
		// N3: padrão parecido com os quadrados dos cantos (1:1:3:1:1 com 4 claros ao lado).
		const s = line.map((v) => (v ? '1' : '0')).join('');
		for (const pat of ['00001011101', '10111010000']) {
			for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) score += 40;
		}
	}
	// N2: blocos 2×2 da mesma cor.
	for (let y = 0; y < n - 1; y++) {
		for (let x = 0; x < n - 1; x++) {
			const c = m[y][x];
			if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
		}
	}
	// N4: equilíbrio entre claros e escuros.
	const dark = m.flat().filter(Boolean).length;
	score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
	return score;
}

/**
 * Código QR de um texto (ex.: um URL curto).
 * @param {string} text
 * @returns {{ size: number, modules: boolean[][], version: number, ecl: 'L' | 'M' }}
 */
export function qrCode(text) {
	const bytes = new TextEncoder().encode(text);
	/** @type {{ ver: number, ecl: 'L' | 'M' } | null} */
	let pick = null;
	for (let ver = 1; ver <= MAX_VERSION && !pick; ver++) {
		for (const ecl of /** @type {const} */ (['M', 'L'])) {
			if (4 + 8 + bytes.length * 8 <= dataCodewords(ver, ecl) * 8) {
				pick = { ver, ecl };
				break;
			}
		}
	}
	if (!pick) throw new Error('Texto demasiado comprido para o código QR.');
	const { ver, ecl } = pick;
	const codewords = addEccAndInterleave(encodeData(bytes, ver, ecl), ver, ecl);

	const base = new Matrix(ver);
	const n = base.size;
	for (let i = 0; i < n; i++) {
		base.setFixed(6, i, i % 2 === 0);
		base.setFixed(i, 6, i % 2 === 0);
	}
	base.finder(3, 3);
	base.finder(n - 4, 3);
	base.finder(3, n - 4);
	const align = alignmentPositions(ver);
	for (const ay of align) {
		for (const ax of align) {
			const corner = (ax === 6 && ay === 6) || (ax === 6 && ay === n - 7) || (ax === n - 7 && ay === 6);
			if (!corner) base.alignment(ax, ay);
		}
	}
	base.format(ecl, 0); // reserva as posições do formato

	// Colocação em zigue-zague, de baixo para cima e de cima para baixo, de 2 em 2 colunas.
	let i = 0;
	for (let right = n - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let vert = 0; vert < n; vert++) {
			for (let j = 0; j < 2; j++) {
				const x = right - j;
				const upward = ((right + 1) & 2) === 0;
				const y = upward ? n - 1 - vert : vert;
				if (!base.fixed[y][x] && i < codewords.length * 8) {
					base.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
					i++;
				}
			}
		}
	}

	let best = /** @type {boolean[][] | null} */ (null);
	let bestScore = Infinity;
	for (let mask = 0; mask < 8; mask++) {
		const m = new Matrix(ver);
		m.modules = base.modules.map((row) => [...row]);
		m.fixed = base.fixed;
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) if (!m.fixed[y][x] && maskBit(mask, x, y)) m.modules[y][x] = !m.modules[y][x];
		}
		m.format(ecl, mask);
		const score = penalty(m.modules);
		if (score < bestScore) {
			bestScore = score;
			best = m.modules;
		}
	}
	return { size: n, modules: /** @type {boolean[][]} */ (best), version: ver, ecl };
}

/** Peças internas, para os testes. */
export const _internal = { rsDivisor, rsRemainder, encodeData, dataCodewords, alignmentPositions };
