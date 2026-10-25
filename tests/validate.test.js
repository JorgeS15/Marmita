import { describe, expect, test } from 'vitest';
import { ValidationError, date, id, int, num, oneOf, text } from '$lib/server/validate.js';
import { safeNext } from '$lib/server/forms.js';
import { addDays, daysBetween, dayMonth, isISODate, weekStartOf, weekdayTitle } from '$lib/dates.js';
import { doses, fmtNum, slotsFor } from '$lib/constants.js';
import { inventoryHref } from '$lib/inventory.js';
import { form } from './helpers.js';

describe('validação de formulários', () => {
	test('texto', () => {
		expect(text(form({ a: '  olá  ' }), 'a')).toBe('olá');
		expect(text(form({}), 'a')).toBe('');
		expect(() => text(form({ a: ' ' }), 'a', { required: true })).toThrow(ValidationError);
		expect(() => text(form({ a: 'abcdef' }), 'a', { max: 5 })).toThrow(/máximo de 5/);
	});

	test('números com vírgula e meias doses', () => {
		expect(num(form({ n: '0,5' }), 'n')).toBe(0.5);
		expect(num(form({ n: '1.333' }), 'n')).toBe(1.33);
		expect(num(form({ n: '' }), 'n', { fallback: 1 })).toBe(1);
		expect(() => num(form({ n: '-1' }), 'n')).toThrow(ValidationError);
		expect(() => num(form({ n: 'abc' }), 'n')).toThrow(ValidationError);
		expect(() => num(form({ n: '0' }), 'n', { min: 0.1 })).toThrow(/entre 0,1/);
		expect(int(form({ n: '3' }), 'n')).toBe(3);
		expect(() => int(form({ n: '2.5' }), 'n')).toThrow(ValidationError);
	});

	test('ids, datas e listas fechadas', () => {
		expect(id(form({ id: '12' }))).toBe(12);
		for (const bad of ['0', '-1', 'x', '', '1e3']) expect(() => id(form({ id: bad }))).toThrow(ValidationError);
		expect(date(form({ d: '2026-02-28' }), 'd')).toBe('2026-02-28');
		expect(date(form({ d: '' }), 'd')).toBeNull();
		expect(() => date(form({ d: '2026-02-30' }), 'd')).toThrow(ValidationError);
		expect(oneOf(form({ s: 'jantar' }), 's', ['almoco', 'jantar'])).toBe('jantar');
		expect(() => oneOf(form({ s: 'ceia' }), 's', ['almoco', 'jantar'])).toThrow(ValidationError);
	});

	test('redirecionamentos só internos', () => {
		expect(safeNext('/inventario')).toBe('/inventario');
		expect(safeNext('//evil.com')).toBe('/');
		expect(safeNext('https://evil.com')).toBe('/');
		expect(safeNext(null)).toBe('/');
		expect(safeNext('/\\evil.com')).toBe('/');
		expect(safeNext('/\t/evil.com')).toBe('/');
		expect(safeNext('/?w=2026-10-11')).toBe('/?w=2026-10-11');
	});
});

describe('datas', () => {
	test('a semana começa ao domingo', () => {
		expect(weekStartOf('2026-10-12')).toBe('2026-10-11'); // segunda → domingo
		expect(weekStartOf('2026-10-11')).toBe('2026-10-11');
		expect(weekStartOf('2026-10-17')).toBe('2026-10-11'); // sábado
	});

	test('ou à segunda-feira, com a definição', () => {
		expect(weekStartOf('2026-10-12', true)).toBe('2026-10-12'); // segunda
		expect(weekStartOf('2026-10-17', true)).toBe('2026-10-12'); // sábado
		expect(weekStartOf('2026-10-18', true)).toBe('2026-10-12'); // domingo fecha a semana
		expect(weekStartOf('2026-11-01', true)).toBe('2026-10-26'); // atravessa o mês
	});

	test('voltar ao inventário com os filtros', () => {
		expect(inventoryHref('local=congelador&q=sopa')).toBe('/inventario?q=sopa&local=congelador');
		expect(inventoryHref('arquivados&categoria=carne')).toBe('/inventario?categoria=carne&arquivados');
		expect(inventoryHref('next=//evil.com')).toBe('/inventario');
		expect(inventoryHref(null)).toBe('/inventario');
	});

	test('contas com datas atravessam meses e a hora de verão', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
		expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
		expect(isISODate('2028-02-29')).toBe(true);
		expect(isISODate('2027-02-29')).toBe(false);
	});

	test('formatos em português', () => {
		expect(dayMonth('2026-10-05')).toBe('5 out');
		expect(weekdayTitle('2026-10-12')).toBe('Segunda-feira');
	});
});

describe('constantes', () => {
	test('doses e lanches', () => {
		expect(fmtNum(0.5)).toBe('0,5');
		expect(fmtNum(2)).toBe('2');
		expect(doses(1)).toMatch(/1 dose$/);
		expect(slotsFor(true).map((s) => s.value)).toContain('lanche_manha');
		const noMorning = slotsFor(false);
		expect(noMorning.map((s) => s.value)).not.toContain('lanche_manha');
		expect(noMorning.find((s) => s.value === 'lanche_tarde')?.label).toBe('Lanche');
	});
});
