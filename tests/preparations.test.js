import { beforeAll, describe, expect, test } from 'vitest';
import { db } from '$lib/server/db.js';
import { addEntry, listToThaw, setStatus } from '$lib/server/plan.js';
import {
	addIngredient,
	addPreparation,
	completePreparation,
	duplicatePreparation,
	getPreparation,
	listIngredients,
	listPrepMeals,
	removeIngredient,
	undoPreparation,
	updatePreparation
} from '$lib/server/preparations.js';
import { item, stock, user } from './helpers.js';

let u = 0;
beforeAll(() => {
	u = user('filipa');
});

const prep = (title = 'Caril', date = '2026-10-13') => addPreparation({ date, title, notes: '', person_id: null }, u);
/** @param {Partial<Parameters<typeof completePreparation>[1]>} d */
const done = (id, d = {}) =>
	completePreparation(
		id,
		{ units: 4, target: null, name: 'Caril', category: 'carne', location: 'frigorifico', stored_on: '2026-10-13', best_before: null, notes: '', ...d },
		u
	);
/** @param {number} prepId @param {Partial<Parameters<typeof addEntry>[0]>} d */
const meal = (prepId, d = {}) =>
	addEntry({ date: '2026-10-14', slot: 'jantar', item_id: null, prep_id: prepId, title: null, units: 1, notes: '', person_id: null, ...d }, u);
const exists = (/** @type {number} */ id) => db().prepare('SELECT 1 FROM items WHERE id = ?').get(id) !== undefined;
const entryRow = (/** @type {number} */ id) => /** @type {any} */ (db().prepare('SELECT * FROM plan_entries WHERE id = ?').get(id));

describe('confirmar preparações', () => {
	test('cria um item novo com as doses e desfazer apaga-o', () => {
		const p = prep();
		expect(done(p)).toBe(true);
		const after = getPreparation(p);
		expect(after?.status).toBe('done');
		expect(stock(/** @type {number} */ (after?.item_id))).toEqual({ quantity: 4, planned: 0, free: 4 });
		expect(done(p)).toBe(false); // não confirma duas vezes

		expect(undoPreparation(p, u)).toBe(true);
		expect(getPreparation(p)?.status).toBe('planned');
		expect(exists(/** @type {number} */ (after?.item_id))).toBe(false);
		// confirmar outra vez não deixa itens repetidos
		done(p);
		expect(/** @type {any} */ (db().prepare(`SELECT COUNT(*) n FROM items WHERE name = 'Caril'`).get()).n).toBe(1);
	});

	test('soma a um item existente', () => {
		const it = item({ name: 'Feijoada', quantity: 1 });
		const p = prep('Feijoada');
		done(p, { target: it, units: 2.5 });
		expect(stock(it).quantity).toBe(3.5);
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(1);
	});

	test('"não pôr no inventário" só marca como feita', () => {
		const before = /** @type {any} */ (db().prepare('SELECT COUNT(*) n FROM items').get()).n;
		const p = prep('Salada');
		done(p, { target: 'none' });
		expect(getPreparation(p)).toMatchObject({ status: 'done', item_id: null, units_added: 0 });
		expect(/** @type {any} */ (db().prepare('SELECT COUNT(*) n FROM items').get()).n).toBe(before);
	});

	test('refeições "Para quando?" passam a usar o item ao confirmar', () => {
		const p = prep('Bolonhesa');
		const a = meal(p, { units: 1 });
		const b = meal(p, { date: '2026-10-15', units: 2 });
		expect(entryRow(a)).toMatchObject({ item_id: null, title: 'Bolonhesa', prep_id: p });
		expect(listPrepMeals([p]).map((m) => m.id)).toEqual([a, b]);

		done(p, { name: 'Bolonhesa', units: 3 });
		const itemId = /** @type {number} */ (getPreparation(p)?.item_id);
		expect(entryRow(a).item_id).toBe(itemId);
		expect(stock(itemId)).toEqual({ quantity: 3, planned: 3, free: 0 });

		// nova refeição com a preparação já feita liga logo ao item
		const c = meal(p, { date: '2026-10-16', units: 0.5 });
		expect(entryRow(c).item_id).toBe(itemId);

		setStatus(a, 'eaten', u);
		expect(stock(itemId).quantity).toBe(2);

		undoPreparation(p, u);
		expect(entryRow(a).item_id).toBeNull();
		expect(entryRow(b).item_id).toBeNull();
		expect(exists(itemId)).toBe(false);
	});

	test('refeição já comida antes de confirmar desconta ao confirmar', () => {
		const p = prep('Bacalhau com natas');
		const a = meal(p);
		setStatus(a, 'eaten', u);
		done(p, { name: 'Bacalhau com natas', units: 3 });
		const itemId = /** @type {number} */ (getPreparation(p)?.item_id);
		expect(stock(itemId).quantity).toBe(2);
		undoPreparation(p, u);
		expect(exists(itemId)).toBe(false);
		expect(entryRow(a)).toMatchObject({ status: 'eaten', item_id: null, deducted: 0 });
	});

	test('mais refeições comidas do que doses feitas não cria doses ao desfazer', () => {
		const it = item({ name: 'Arroz doce', quantity: 0 });
		const p = prep('Arroz doce');
		const a = meal(p);
		const b = meal(p, { date: '2026-10-15' });
		setStatus(a, 'eaten', u);
		setStatus(b, 'eaten', u);
		done(p, { target: it, units: 1 });
		expect(stock(it).quantity).toBe(0);
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(0);
	});

	test('desfazer não apaga um item que já existia', () => {
		const it = item({ name: 'Grão cozido', quantity: 0 });
		const p = prep('Grão cozido');
		done(p, { target: it, units: 2 });
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(0);
	});

	test('mudar o nome da preparação muda as refeições ainda sem item', () => {
		const p = prep('Arroz');
		const a = meal(p);
		updatePreparation(p, { date: '2026-10-13', title: 'Arroz de pato', notes: '', person_id: null }, u);
		expect(entryRow(a).title).toBe('Arroz de pato');
	});

	test('duplicar copia para outros dias, por fazer', () => {
		const p = prep('Sopa');
		done(p, { target: 'none' });
		expect(duplicatePreparation(p, ['2026-10-20', '2026-10-21'], u)).toBe(2);
		const copies = /** @type {any[]} */ (db().prepare(`SELECT date, status FROM preparations WHERE title = 'Sopa' AND id != ? ORDER BY date`).all(p));
		expect(copies).toEqual([
			{ date: '2026-10-20', status: 'planned' },
			{ date: '2026-10-21', status: 'planned' }
		]);
	});
});

describe('ingredientes', () => {
	test('reservam stock, descontam ao confirmar e repõem ao desfazer', () => {
		const cous = item({ name: 'Couscous', quantity: 2, location: 'congelador' });
		const p = prep('Salada de couscous', '2034-01-02');
		expect(addIngredient(p, cous, 1.5)).toBe(true);
		expect(stock(cous)).toEqual({ quantity: 2, planned: 1.5, free: 0.5 });
		expect(listIngredients([p])).toHaveLength(1);

		// aparece no aviso de descongelar da véspera
		expect(listToThaw('2034-01-01').some((t) => t.kind === 'ingredient' && t.title === 'Couscous')).toBe(true);

		done(p, { target: 'none' });
		expect(stock(cous)).toEqual({ quantity: 0.5, planned: 0, free: 0.5 });
		// depois de feita não se mexe nos ingredientes
		expect(addIngredient(p, cous, 1)).toBe(false);
		expect(removeIngredient(listIngredients([p])[0].id, p)).toBe(false);

		undoPreparation(p, u);
		expect(stock(cous)).toEqual({ quantity: 2, planned: 1.5, free: 0.5 });
	});

	test('com stock insuficiente só desconta o que há e repõe o mesmo', () => {
		const it = item({ name: 'Natas', quantity: 1 });
		const p = prep('Gratinado');
		addIngredient(p, it, 3);
		done(p, { target: 'none' });
		expect(stock(it).quantity).toBe(0);
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(1);
	});

	test('o mesmo item duas vezes não cria stock ao desfazer', () => {
		const it = item({ name: 'Bechamel', quantity: 1 });
		const p = prep('Lasanha');
		addIngredient(p, it, 1);
		addIngredient(p, it, 1);
		done(p, { target: 'none' });
		expect(stock(it).quantity).toBe(0);
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(1);
	});

	test('remover ingrediente liberta a reserva', () => {
		const it = item({ name: 'Grão', quantity: 2 });
		const p = prep('Hummus');
		addIngredient(p, it, 1);
		expect(removeIngredient(listIngredients([p])[0].id, p + 1000)).toBe(false); // de outra preparação
		expect(removeIngredient(listIngredients([p])[0].id, p)).toBe(true);
		expect(stock(it)).toEqual({ quantity: 2, planned: 0, free: 2 });
	});
});
