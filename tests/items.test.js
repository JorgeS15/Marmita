import { beforeAll, describe, expect, test } from 'vitest';
import { db } from '$lib/server/db.js';
import { addEntry } from '$lib/server/plan.js';
import { moveDoses } from '$lib/server/items.js';
import { item, stock, user } from './helpers.js';

let u = 0;
beforeAll(() => {
	u = user('jorge');
});

/** @param {number} itemId @param {string} date */
const meal = (itemId, date) =>
	addEntry({ date, slot: 'jantar', item_id: itemId, title: null, units: 1, notes: '', person_id: null }, u);
const itemOf = (/** @type {number} */ e) => /** @type {any} */ (db().prepare('SELECT item_id FROM plan_entries WHERE id = ?').get(e)).item_id;

describe('mover doses entre locais', () => {
	test('congelar parte: cria o item no congelador e leva as refeições mais distantes', () => {
		const src = item({ name: 'Caril', location: 'frigorifico', quantity: 5, stored_on: '2026-11-01' });
		const a = meal(src, '2026-11-02');
		const b = meal(src, '2026-11-03');
		const c = meal(src, '2026-11-20');
		const d = meal(src, '2026-11-25');
		const to = /** @type {number} */ (moveDoses(src, { units: 2, location: 'congelador', best_before: null }, u));
		expect(to).not.toBe(src);
		expect(db().prepare('SELECT name, location, stored_on FROM items WHERE id = ?').get(to)).toEqual({
			name: 'Caril',
			location: 'congelador',
			stored_on: '2026-11-01'
		});
		expect(stock(src)).toEqual({ quantity: 3, planned: 2, free: 1 });
		expect(stock(to)).toEqual({ quantity: 2, planned: 2, free: 0 });
		expect([a, b, c, d].map(itemOf)).toEqual([src, src, to, to]);
	});

	test('descongelar: junta-se ao item do frigorífico e leva a refeição mais próxima', () => {
		const fridge = item({ name: 'Lasanha', location: 'frigorifico', quantity: 0 });
		const freezer = item({ name: 'Lasanha', location: 'congelador', quantity: 3 });
		const soon = meal(freezer, '2026-11-02');
		const later = meal(freezer, '2026-11-09');
		expect(moveDoses(freezer, { units: 1, location: 'frigorifico', best_before: '2026-11-04' }, u)).toBe(fridge);
		expect(stock(fridge).quantity).toBe(1);
		expect(stock(freezer).quantity).toBe(2);
		expect(db().prepare('SELECT best_before FROM items WHERE id = ?').get(fridge)).toEqual({ best_before: '2026-11-04' });
		expect([soon, later].map(itemOf)).toEqual([fridge, freezer]);
	});

	test('meias doses e validações', () => {
		const src = item({ name: 'Sopa', location: 'frigorifico', quantity: 1.5 });
		moveDoses(src, { units: 0.5, location: 'congelador', best_before: null }, u);
		expect(stock(src).quantity).toBe(1);
		expect(() => moveDoses(src, { units: 2, location: 'congelador', best_before: null }, u)).toThrow(/Só há 1 dose\./);
		expect(() => moveDoses(src, { units: 1, location: 'frigorifico', best_before: null }, u)).toThrow(/outro local/);
		expect(moveDoses(999999, { units: 1, location: 'congelador', best_before: null }, u)).toBeNull();
	});
});
