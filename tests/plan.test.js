import { beforeAll, describe, expect, test } from 'vitest';
import { db } from '$lib/server/db.js';
import {
	addEntry,
	autoConsume,
	duplicateEntry,
	listPending,
	listToThaw,
	listWeek,
	moveEntry,
	removeEntry,
	setStatus,
	updateEntry
} from '$lib/server/plan.js';
import { deleteItem } from '$lib/server/items.js';
import { item, stock, user } from './helpers.js';

let u = 0;
beforeAll(() => {
	u = user('jorge');
});

/** @param {Partial<Parameters<typeof addEntry>[0]>} d */
const entry = (d) =>
	addEntry({ date: '2026-10-14', slot: 'jantar', item_id: null, title: null, units: 1, notes: '', person_id: null, ...d }, u);

describe('stock das refeições', () => {
	test('planear reserva, comer desconta, desfazer repõe', () => {
		const it = item({ name: 'Bacalhau', quantity: 3 });
		const e = entry({ item_id: it });
		expect(stock(it)).toEqual({ quantity: 3, planned: 1, free: 2 });

		setStatus(e, 'eaten', u);
		expect(stock(it)).toEqual({ quantity: 2, planned: 0, free: 2 });

		setStatus(e, 'planned', u);
		expect(stock(it)).toEqual({ quantity: 3, planned: 1, free: 2 });

		setStatus(e, 'skipped', u);
		expect(stock(it)).toEqual({ quantity: 3, planned: 0, free: 3 });

		removeEntry(e);
		expect(stock(it)).toEqual({ quantity: 3, planned: 0, free: 3 });
	});

	test('meias doses (0,5) em itens com quantidade inteira', () => {
		const it = item({ name: 'Sopa', quantity: 2 });
		const e = entry({ item_id: it, units: 0.5 });
		expect(stock(it)).toEqual({ quantity: 2, planned: 0.5, free: 1.5 });
		setStatus(e, 'eaten', u);
		expect(stock(it).quantity).toBe(1.5);
		setStatus(e, 'planned', u);
		expect(stock(it).quantity).toBe(2);
	});

	test('editar doses de uma refeição já comida acerta o stock', () => {
		const it = item({ name: 'Arroz', quantity: 4 });
		const e = entry({ item_id: it, units: 1 });
		setStatus(e, 'eaten', u);
		expect(stock(it).quantity).toBe(3);
		updateEntry(e, { units: 2, notes: '', person_id: null }, u);
		expect(stock(it).quantity).toBe(2);
		updateEntry(e, { units: 0.5, notes: '', person_id: null }, u);
		expect(stock(it).quantity).toBe(3.5);
	});

	test('comer mais do que há não cria doses ao desfazer', () => {
		const it = item({ name: 'Pudim', quantity: 1 });
		const a = entry({ item_id: it });
		const b = entry({ item_id: it, date: '2026-10-15' });
		setStatus(a, 'eaten', u);
		setStatus(b, 'eaten', u);
		expect(stock(it).quantity).toBe(0);
		setStatus(a, 'planned', u);
		setStatus(b, 'planned', u);
		expect(stock(it).quantity).toBe(1);

		// o mesmo ao aumentar e voltar a baixar as doses de uma refeição comida
		setStatus(a, 'eaten', u);
		updateEntry(a, { units: 3, notes: '', person_id: null }, u);
		expect(stock(it).quantity).toBe(0);
		updateEntry(a, { units: 1, notes: '', person_id: null }, u);
		expect(stock(it).quantity).toBe(0);
		setStatus(a, 'planned', u);
		expect(stock(it).quantity).toBe(1);
	});

	test('o título acompanha o item; texto livre só muda sem item', () => {
		const it = item({ name: 'Lasanha' });
		const a = entry({ item_id: it, title: 'ignorado' });
		const b = entry({ title: 'Pizza' });
		updateEntry(a, { units: 1, notes: '', person_id: null, title: 'Outro' }, u);
		updateEntry(b, { units: 1, notes: 'x', person_id: null, title: 'Pizza caseira' }, u);
		const titles = Object.fromEntries(
			/** @type {any[]} */ (db().prepare('SELECT id, title FROM plan_entries WHERE id IN (?, ?)').all(a, b)).map((r) => [r.id, r.title])
		);
		expect(titles[a]).toBe('Lasanha');
		expect(titles[b]).toBe('Pizza caseira');
	});

	test('duplicar copia doses, pessoa e nota para outros dias, como planeadas', () => {
		const it = item({ name: 'Frango', quantity: 5 });
		const e = entry({ item_id: it, units: 0.5, notes: 'com arroz', person_id: u });
		setStatus(e, 'eaten', u);
		expect(duplicateEntry(e, ['2026-10-15', '2026-10-16'], 'almoco', u)).toBe(2);
		const copies = /** @type {any[]} */ (
			db().prepare('SELECT date, slot, units, notes, person_id, status FROM plan_entries WHERE item_id = ? AND id != ? ORDER BY date').all(it, e)
		);
		expect(copies).toEqual([
			{ date: '2026-10-15', slot: 'almoco', units: 0.5, notes: 'com arroz', person_id: u, status: 'planned' },
			{ date: '2026-10-16', slot: 'almoco', units: 0.5, notes: 'com arroz', person_id: u, status: 'planned' }
		]);
		expect(stock(it)).toEqual({ quantity: 4.5, planned: 1, free: 3.5 });
	});

	test('mover muda dia e refeição', () => {
		const e = entry({ title: 'Tosta', slot: 'lanche_tarde' });
		moveEntry(e, '2026-10-17', 'pequeno_almoco', u);
		expect(db().prepare('SELECT date, slot FROM plan_entries WHERE id = ?').get(e)).toEqual({ date: '2026-10-17', slot: 'pequeno_almoco' });
	});

	test('apagar o item mantém a refeição como texto', () => {
		const it = item({ name: 'Rissóis' });
		const e = entry({ item_id: it });
		deleteItem(it);
		expect(db().prepare('SELECT item_id, title FROM plan_entries WHERE id = ?').get(e)).toEqual({ item_id: null, title: 'Rissóis' });
	});

	test('rejeita item inexistente', () => {
		expect(() => entry({ item_id: 999999 })).toThrow(/já não existe/);
	});

	test('ações sobre ids inexistentes não rebentam', () => {
		expect(setStatus(999999, 'eaten', u)).toBe(false);
		expect(updateEntry(999999, { units: 1, notes: '', person_id: null }, u)).toBe(false);
		expect(moveEntry(999999, '2026-10-14', 'jantar', u)).toBe(false);
		expect(duplicateEntry(999999, ['2026-10-14'], 'jantar', u)).toBe(0);
		expect(removeEntry(999999)).toBe(false);
	});
});

describe('semana, pendentes e descongelar', () => {
	test('listWeek devolve só os 7 dias a partir de domingo', () => {
		const d = '2030-01-06'; // domingo
		entry({ date: '2030-01-05', title: 'antes' });
		entry({ date: d, title: 'domingo' });
		entry({ date: '2030-01-12', title: 'sábado' });
		entry({ date: '2030-01-13', title: 'depois' });
		expect(listWeek(d).map((e) => e.title)).toEqual(['domingo', 'sábado']);
	});

	test('pendentes: dias passados e refeições de hoje cuja hora já passou', () => {
		const day = '2031-03-10';
		const lunch = entry({ date: day, slot: 'almoco', title: 'almoço' });
		const dinner = entry({ date: day, slot: 'jantar', title: 'jantar' });
		const ids = (/** @type {number} */ hour) => listPending({ date: day, hour }).map((e) => e.id).filter((id) => id === lunch || id === dinner);
		expect(ids(10)).toEqual([]);
		expect(ids(15)).toEqual([lunch]);
		expect(ids(22)).toEqual([lunch, dinner]);
		expect(listPending({ date: '2031-03-11', hour: 0 }).map((e) => e.id)).toEqual(expect.arrayContaining([lunch, dinner]));
	});

	test('autoConsume marca como comidas as que já passaram e desconta o stock', () => {
		const it = item({ name: 'Empadão', quantity: 2 });
		const e = entry({ date: '2032-05-05', slot: 'almoco', item_id: it });
		autoConsume({ date: '2032-05-05', hour: 16 });
		expect(db().prepare('SELECT status FROM plan_entries WHERE id = ?').get(e)).toEqual({ status: 'eaten' });
		expect(stock(it).quantity).toBe(1);
		autoConsume({ date: '2032-05-05', hour: 16 });
		expect(stock(it).quantity).toBe(1);
	});

	test('autoConsume ignora o que é anterior ao dia em que as confirmações foram desligadas', () => {
		const it = item({ name: 'Croquetes', quantity: 3 });
		const old = entry({ date: '2032-06-01', item_id: it });
		const recent = entry({ date: '2032-06-10', item_id: it });
		autoConsume({ date: '2032-06-11', hour: 9 }, '2032-06-05');
		expect(db().prepare('SELECT status FROM plan_entries WHERE id = ?').get(old)).toEqual({ status: 'planned' });
		expect(db().prepare('SELECT status FROM plan_entries WHERE id = ?').get(recent)).toEqual({ status: 'eaten' });
		expect(stock(it).quantity).toBe(2);
	});

	test('descongelar: congelador, hoje e amanhã, ainda não tirado', () => {
		const frozen = item({ name: 'Peixe congelado', location: 'congelador' });
		const fridge = item({ name: 'Sopa do frigorífico', location: 'frigorifico' });
		entry({ date: '2033-02-01', item_id: frozen });
		entry({ date: '2033-02-02', item_id: frozen });
		entry({ date: '2033-02-03', item_id: frozen });
		entry({ date: '2033-02-01', item_id: fridge });
		const list = listToThaw('2033-02-01');
		expect(list.map((t) => [t.date, t.title])).toEqual([
			['2033-02-01', 'Peixe congelado'],
			['2033-02-02', 'Peixe congelado']
		]);
	});
});
