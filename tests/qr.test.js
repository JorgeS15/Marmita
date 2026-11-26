import { describe, expect, test } from 'vitest';
import { _internal, qrCode } from '$lib/labels/qr.js';
import { decode } from './qr-decode.js';

const { rsDivisor, rsRemainder, dataCodewords, alignmentPositions } = _internal;

describe('peças do QR (valores publicados)', () => {
	test('Reed–Solomon: exemplo "HELLO WORLD" 1-M', () => {
		const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
		expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
	});

	test('capacidade em bytes por versão e nível', () => {
		const bytes = (/** @type {number} */ v, /** @type {'L' | 'M'} */ e) => Math.floor((dataCodewords(v, e) * 8 - 12) / 8);
		expect([1, 2, 3, 4, 5, 6].map((v) => bytes(v, 'M'))).toEqual([14, 26, 42, 62, 84, 106]);
		expect([1, 2, 3, 4, 5, 6].map((v) => bytes(v, 'L'))).toEqual([17, 32, 53, 78, 106, 134]);
	});

	test('padrões de alinhamento', () => {
		expect([1, 2, 3, 4, 5, 6].map(alignmentPositions)).toEqual([[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]]);
	});
});

describe('código QR completo', () => {
	const samples = [
		'1',
		'https://marmita.exemplo.pt/i/7',
		'http://192.168.1.50:4004/i/1234',
		'https://marmita.uma-casa-com-um-nome-comprido.pt/i/98765',
		'Bacalhau à Brás — 2 doses',
		'x'.repeat(100)
	];

	for (const text of samples) {
		test(`lê-se de volta: ${text.slice(0, 40)}`, () => {
			const qr = qrCode(text);
			expect(qr.modules).toHaveLength(qr.size);
			const out = decode(qr.modules);
			expect(out.text).toBe(text);
			expect(out.ver).toBe(qr.version);
			expect(out.ecl).toBe(qr.ecl);
		});
	}

	test('escolhe a versão mais pequena (com correção M sempre que cabe)', () => {
		expect(qrCode('https://marmita.exemplo.pt/i/7')).toMatchObject({ version: 2, ecl: 'L', size: 25 });
		expect(qrCode('http://192.168.1.5/i/12')).toMatchObject({ version: 2, ecl: 'M' });
		expect(() => qrCode('x'.repeat(200))).toThrow('demasiado comprido');
	});

	test('quadrados dos cantos e linhas de tempo', () => {
		const { modules: m, size: n } = qrCode('teste');
		const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
		for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
			expect(finder.map((_, y) => finder[y].split('').map((_, x) => (m[oy + y][ox + x] ? '1' : '0')).join(''))).toEqual(finder);
		}
		for (let i = 8; i < n - 8; i++) {
			expect(m[6][i]).toBe(i % 2 === 0);
			expect(m[i][6]).toBe(i % 2 === 0);
		}
	});
});
