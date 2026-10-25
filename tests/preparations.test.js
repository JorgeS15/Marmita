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
	listOutputs,
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
/**
 * Confirma a preparação. Atalhos: `units` + `location` (um só local), `none` (não pôr no inventário),
 * ou `outputs` com a divisão por local. O nome é o da preparação.
 * @param {number} id
 * @param {{ units?: number, location?: string, none?: boolean, outputs?: { location: string, units: number, best_before?: string | null }[], name?: string }} [d]
 */
const done = (id, d = {}) =>
	completePreparation(
		id,
		{
			none: d.none,
			outputs: (d.outputs ?? [{ location: d.location ?? 'congelador', units: d.units ?? 4 }]).map((o) => ({ best_before: null, ...o })),
			name: d.name ?? /** @type {string} */ (getPreparation(id)?.title),
			category: 'carne',
			stored_on: '2026-10-13',
			notes: ''
		},
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
		done(p, { units: 2.5 });
		expect(stock(it).quantity).toBe(3.5);
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(1);
	});

	test('"não pôr no inventário" só marca como feita', () => {
		const before = /** @type {any} */ (db().prepare('SELECT COUNT(*) n FROM items').get()).n;
		const p = prep('Salada');
		done(p, { none: true });
		expect(getPreparation(p)).toMatchObject({ status: 'done', item_id: null, units_added: 0 });
		expect(listOutputs([p])).toEqual([]);
		expect(/** @type {any} */ (db().prepare('SELECT COUNT(*) n FROM items').get()).n).toBe(before);
	});

	test('refeições "Para quando?" passam a usar o item ao confirmar', () => {
		const p = prep('Bolonhesa');
		const a = meal(p, { units: 1 });
		const b = meal(p, { date: '2026-10-15', units: 2 });
		expect(entryRow(a)).toMatchObject({ item_id: null, title: 'Bolonhesa', prep_id: p });
		expect(listPrepMeals([p]).map((m) => m.id)).toEqual([a, b]);

		done(p, { units: 3 });
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
		done(p, { units: 3 });
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
		done(p, { units: 1 });
		expect(stock(it).quantity).toBe(0);
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(0);
	});

	test('desfazer não apaga um item que já existia', () => {
		const it = item({ name: 'Grão cozido', quantity: 0 });
		const p = prep('Grão cozido');
		done(p, { units: 2 });
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(0);
	});

	test('dividir por locais: um item por local e as refeições distribuídas por data', () => {
		const p = prep('Caril de grão', '2026-11-02');
		const late = meal(p, { date: '2026-11-10', slot: 'jantar', units: 2 });
		const first = meal(p, { date: '2026-11-03', slot: 'jantar', units: 1 });
		const lunch = meal(p, { date: '2026-11-03', slot: 'almoco', units: 1 });
		const third = meal(p, { date: '2026-11-04', slot: 'almoco', units: 1 });
		setStatus(lunch, 'eaten', u);
		done(p, {
			outputs: [
				{ location: 'congelador', units: 2 },
				{ location: 'frigorifico', units: 3, best_before: '2026-11-05' }
			]
		});
		const outs = listOutputs([p]);
		expect(outs.map((o) => [o.location, o.units, o.created])).toEqual([
			['frigorifico', 3, 1],
			['congelador', 2, 1]
		]);
		const [fridge, freezer] = outs.map((o) => /** @type {number} */ (o.item_id));
		expect(db().prepare('SELECT best_before FROM items WHERE id = ?').get(fridge)).toEqual({ best_before: '2026-11-05' });
		// as 3 primeiras (almoço e jantar de dia 3, almoço de dia 4) ficam no frigorífico; a de dia 10 no congelador
		expect([lunch, first, third].map((e) => entryRow(e).item_id)).toEqual([fridge, fridge, fridge]);
		expect(entryRow(late).item_id).toBe(freezer);
		// o almoço já comido desconta do frigorífico
		expect(stock(fridge)).toEqual({ quantity: 2, planned: 2, free: 0 });
		expect(stock(freezer)).toEqual({ quantity: 2, planned: 2, free: 0 });
		expect(getPreparation(p)?.item_id).toBe(fridge);

		undoPreparation(p, u);
		expect(exists(fridge)).toBe(false);
		expect(exists(freezer)).toBe(false);
		expect(listOutputs([p])).toEqual([]);
		expect(entryRow(lunch)).toMatchObject({ item_id: null, deducted: 0, status: 'eaten' });
	});

	test('dividir junta-se aos itens com o mesmo nome no mesmo local', () => {
		const fridge = item({ name: 'Sopa de legumes', location: 'frigorifico', quantity: 1 });
		const freezer = item({ name: 'Sopa de legumes', location: 'congelador', quantity: 2 });
		const p = prep('Sopa de legumes');
		done(p, { outputs: [{ location: 'frigorifico', units: 2 }, { location: 'congelador', units: 3 }] });
		expect(stock(fridge).quantity).toBe(3);
		expect(stock(freezer).quantity).toBe(5);
		undoPreparation(p, u);
		expect(stock(fridge).quantity).toBe(1);
		expect(stock(freezer).quantity).toBe(2);
	});

	test('mudar o nome da preparação muda as refeições ainda sem item', () => {
		const p = prep('Arroz');
		const a = meal(p);
		updatePreparation(p, { date: '2026-10-13', title: 'Arroz de pato', notes: '', person_id: null }, u);
		expect(entryRow(a).title).toBe('Arroz de pato');
	});

	test('duplicar copia para outros dias, por fazer', () => {
		const p = prep('Sopa');
		done(p, { none: true });
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

		done(p, { none: true });
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
		done(p, { none: true });
		expect(stock(it).quantity).toBe(0);
		undoPreparation(p, u);
		expect(stock(it).quantity).toBe(1);
	});

	test('o mesmo item duas vezes não cria stock ao desfazer', () => {
		const it = item({ name: 'Bechamel', quantity: 1 });
		const p = prep('Lasanha');
		addIngredient(p, it, 1);
		addIngredient(p, it, 1);
		done(p, { none: true });
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
