// Descodificador mínimo de QR (versões 1–6, modo byte, níveis L/M), escrito de
// raiz a partir da norma e independente do gerador: serve para os testes.

/** Cadeias de formato da norma (máscara 0..7). */
const FORMATS = {
	L: ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'],
	M: ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000']
};
const BLOCKS = { L: [[1, 7], [1, 10], [1, 15], [1, 20], [1, 26], [2, 18]], M: [[1, 10], [1, 16], [1, 26], [2, 18], [2, 24], [4, 16]] };
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
const MASKS = [
	(/** @type {number} */ x, /** @type {number} */ y) => (x + y) % 2 === 0,
	(_x, /** @type {number} */ y) => y % 2 === 0,
	(/** @type {number} */ x) => x % 3 === 0,
	(/** @type {number} */ x, /** @type {number} */ y) => (x + y) % 3 === 0,
	(/** @type {number} */ x, /** @type {number} */ y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
	(/** @type {number} */ x, /** @type {number} */ y) => ((x * y) % 2) + ((x * y) % 3) === 0,
	(/** @type {number} */ x, /** @type {number} */ y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
	(/** @type {number} */ x, /** @type {number} */ y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

/** Síndromes do bloco (todas 0 = sem erros). @param {number[]} block */
function syndromesOk(block, /** @type {number} */ eccLen) {
	const exp = [1];
	for (let i = 1; i < 255; i++) exp[i] = (exp[i - 1] << 1) ^ (exp[i - 1] & 0x80 ? 0x11d : 0);
	const mul = (/** @type {number} */ a, /** @type {number} */ b) => {
		let r = 0;
		for (let i = 0; i < 8; i++) if ((b >> i) & 1) r ^= exp.indexOf(a) < 0 ? 0 : exp[(exp.indexOf(a) + i) % 255];
		return r;
	};
	for (let k = 0; k < eccLen; k++) {
		let s = 0;
		for (const c of block) s = mul(s, exp[k]) ^ c;
		if (s !== 0) return false;
	}
	return true;
}

/** Lê uma matriz QR (true = preto) e devolve o texto. @param {boolean[][]} m */
export function decode(m) {
	const n = m.length;
	const ver = (n - 17) / 4;
	const bit = (/** @type {number} */ x, /** @type {number} */ y) => (m[y][x] ? '1' : '0');
	let fmt = '';
	for (let i = 0; i <= 5; i++) fmt += bit(8, i);
	fmt += bit(8, 7) + bit(8, 8) + bit(7, 8);
	for (let i = 9; i < 15; i++) fmt += bit(14 - i, 8);
	fmt = [...fmt].reverse().join(''); // bit 14 primeiro
	let ecl = /** @type {'L' | 'M' | ''} */ ('');
	let mask = -1;
	for (const e of /** @type {const} */ (['L', 'M'])) FORMATS[e].forEach((f, i) => f === fmt && ((ecl = e), (mask = i)));
	if (!ecl) throw new Error(`formato desconhecido ${fmt}`);
	// O segundo exemplar do formato tem de bater.
	let fmt2 = '';
	for (let i = 0; i < 8; i++) fmt2 += bit(n - 1 - i, 8);
	for (let i = 8; i < 15; i++) fmt2 += bit(8, n - 15 + i);
	if ([...fmt2].reverse().join('') !== fmt) throw new Error('segundo formato diferente');
	if (!m[n - 8][8]) throw new Error('falta o módulo escuro');

	const reserved = (/** @type {number} */ x, /** @type {number} */ y) => {
		if ((x < 9 && y < 9) || (x >= n - 8 && y < 9) || (x < 9 && y >= n - 8)) return true;
		if (x === 6 || y === 6) return true;
		const a = ALIGN[ver - 1];
		for (const ax of a) for (const ay of a) {
			const corner = (ax === 6 && ay === 6) || (ax === 6 && ay === n - 7) || (ax === n - 7 && ay === 6);
			if (!corner && Math.abs(x - ax) <= 2 && Math.abs(y - ay) <= 2) return true;
		}
		return false;
	};
	/** @type {number[]} */
	const bits = [];
	let up = true;
	for (let right = n - 1; right > 0; right -= 2) {
		if (right === 6) right--;
		for (let k = 0; k < n; k++) {
			const y = up ? n - 1 - k : k;
			for (const x of [right, right - 1]) {
				if (!reserved(x, y)) bits.push(Number(m[y][x] !== MASKS[mask](x, y)));
			}
		}
		up = !up;
	}
	const bytes = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
	const [numBlocks, eccLen] = BLOCKS[ecl][ver - 1];
	const total = bytes.length;
	const shortLen = Math.floor(total / numBlocks);
	const numShort = numBlocks - (total % numBlocks);
	/** @type {number[][]} */
	const blocks = Array.from({ length: numBlocks }, () => []);
	let k = 0;
	for (let i = 0; i < shortLen - eccLen; i++) for (const b of blocks) b.push(bytes[k++]);
	for (let j = numShort; j < numBlocks; j++) blocks[j].push(bytes[k++]);
	/** @type {number[][]} */
	const eccs = Array.from({ length: numBlocks }, () => []);
	for (let i = 0; i < eccLen; i++) for (const e of eccs) e.push(bytes[k++]);
	blocks.forEach((b, j) => {
		if (!syndromesOk([...b, ...eccs[j]], eccLen)) throw new Error(`bloco ${j} com erros`);
	});
	const data = blocks.flat();
	const dbits = data.flatMap((b) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (b >> i) & 1));
	const read = (/** @type {number} */ from, /** @type {number} */ len) => dbits.slice(from, from + len).reduce((a, b) => a * 2 + b, 0);
	if (read(0, 4) !== 0b0100) throw new Error('modo diferente de byte');
	const len = read(4, 8);
	const out = new Uint8Array(len);
	for (let i = 0; i < len; i++) out[i] = read(12 + i * 8, 8);
	return { text: new TextDecoder().decode(out), ecl, mask, ver };
}
