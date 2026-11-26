import { describe, expect, test } from 'vitest';
import { itemQrUrl, labelContent, labelDots, labelSize, shortDate } from '$lib/labels/model.js';
import { ellipsize, layoutLabel, layoutQr, toMono } from '$lib/labels/render.js';

/** Medida falsa: cada carácter ocupa 0,6 × o tamanho (1,1 × em negrito). */
const measure = (/** @type {string} */ t, /** @type {number} */ size, /** @type {boolean} */ bold) =>
	t.length * size * (bold ? 0.66 : 0.6);

describe('conteúdo das etiquetas', () => {
	test('congelador: data de congelação, validade e doses', () => {
		const c = labelContent(
			{ name: ' Arroz de pato ', location: 'congelador', stored_on: '2026-11-24', best_before: '2027-02-24' },
			{ doses: 2 }
		);
		expect(c).toEqual({ title: 'Arroz de pato', lines: ['Cong. 24/11/26', 'Até 24/02/27 · 2 doses'] });
	});

	test('frigorífico sem validade: doses juntam-se à data', () => {
		const c = labelContent({ name: 'Sopa', location: 'frigorifico', stored_on: '2026-11-24', best_before: null });
		expect(c.lines).toEqual(['Feito 24/11/26 · 1 dose']);
	});

	test('meia dose e opções desligadas', () => {
		const item = { name: 'Bolo', location: 'despensa', stored_on: '2026-11-24', best_before: '2026-12-01' };
		expect(labelContent(item, { doses: 0.5, showStored: false, showBestBefore: false }).lines).toEqual(['0,5 dose']);
		expect(labelContent(item, { showDoses: false, showBestBefore: false }).lines).toEqual(['Desde 24/11/26']);
		expect(labelContent(item, { showStored: false, showBestBefore: false, showDoses: false }).lines).toEqual([]);
	});

	test('datas e tamanhos', () => {
		expect(shortDate('2026-01-05')).toBe('05/01/26');
		expect(shortDate('2026-02-30')).toBe('');
		expect(shortDate(null)).toBe('');
		expect(labelDots('40x12')).toEqual({ width: 320, height: 96 });
		// Rolos de 15 mm: a cabeça só imprime 12 mm (96 pontos).
		expect(labelDots('30x15')).toEqual({ width: 240, height: 96 });
		expect(labelSize('xpto').value).toBe('40x12');
	});
});

describe('disposição do texto', () => {
	const dots = { width: 320, height: 96 };

	test('título maior que as linhas e tudo dentro da etiqueta', () => {
		const rows = layoutLabel({ title: 'Arroz de pato', lines: ['Cong. 24/11/26', 'Até 24/02/27 · 1 dose'] }, dots, measure);
		expect(rows).toHaveLength(3);
		expect(rows[0].bold).toBe(true);
		expect(rows[0].size).toBeGreaterThan(rows[1].size);
		const last = rows.at(-1);
		expect(last && last.y + last.size).toBeLessThanOrEqual(dots.height);
		for (const r of rows) expect(measure(r.text, r.size, r.bold)).toBeLessThanOrEqual(dots.width - 8);
	});

	test('só o título: ocupa mais altura', () => {
		const [only] = layoutLabel({ title: 'Sopa', lines: [] }, dots, measure);
		const [withLines] = layoutLabel({ title: 'Sopa', lines: ['Cong. 24/11/26'] }, dots, measure);
		expect(only.size).toBeGreaterThan(withLines.size);
	});

	test('nomes compridos encolhem e depois são cortados com …', () => {
		const long = 'Bacalhau com natas da avó Maria e grelos salteados';
		const [row] = layoutLabel({ title: long, lines: ['Cong. 24/11/26'] }, dots, measure);
		expect(row.size).toBe(14);
		expect(row.text.endsWith('…')).toBe(true);
		expect(measure(row.text, row.size, true)).toBeLessThanOrEqual(dots.width - 8);
		expect(ellipsize('curto', 10, false, 1000, measure)).toBe('curto');
	});

	test('preto e branco puro', () => {
		const px = new Uint8ClampedArray([10, 10, 10, 255, 200, 200, 200, 255, 0, 0, 0, 0]);
		expect([...toMono(px)]).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
	});
});

describe('código QR na etiqueta', () => {
	const dots = { width: 320, height: 96 };

	test('endereço curto do item', () => {
		expect(itemQrUrl('https://marmita.exemplo.pt/', 42)).toBe('https://marmita.exemplo.pt/i/42');
		const c = labelContent({ name: 'Sopa', location: 'frigorifico' }, { qr: 'https://m.pt/i/1' });
		expect(c.qr).toBe('https://m.pt/i/1');
		expect('qr' in labelContent({ name: 'Sopa', location: 'frigorifico' })).toBe(false);
	});

	test('quadrado à esquerda com módulos inteiros e margem', () => {
		const qr = layoutQr('https://marmita.exemplo.pt/i/42', dots);
		const side = qr.modules.length * qr.scale;
		expect(qr.scale).toBe(3); // versão 2: 25 módulos × 3 pontos = 75 de 96
		expect(qr.x).toBeGreaterThanOrEqual(qr.scale);
		expect(qr.y + side).toBeLessThanOrEqual(dots.height - qr.scale);
	});

	test('com QR, o texto cabe no espaço à direita', () => {
		const content = { title: 'Arroz de pato', lines: ['Cong. 24/11/26', 'Até 24/02/27 · 1 dose'], qr: 'x' };
		for (const r of layoutLabel(content, dots, measure)) {
			expect(measure(r.text, r.size, r.bold)).toBeLessThanOrEqual(dots.width - dots.height - 8);
		}
	});
});

