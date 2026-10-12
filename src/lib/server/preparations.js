import { db, transaction } from './db.js';
import { returnStock, takeStock } from './plan.js';
import { addDays } from '$lib/dates.js';

/**
 * @typedef {object} Preparation
 * @property {number} id
 * @property {string} date
 * @property {string} title
 * @property {string} notes
 * @property {number | null} person_id
 * @property {string | null} person_name
 * @property {string | null} person_color
 * @property {'planned' | 'done'} status
 * @property {number | null} item_id
 * @property {string | null} item_name
 * @property {number} units_added
 * @property {number} created_item
 * @property {string | null} created_by_name
 */

const SELECT = `
	SELECT p.id, p.date, p.title, p.notes, p.person_id, p.status, p.item_id, p.units_added, p.created_item,
	       pu.display_name AS person_name, pu.color AS person_color,
	       i.name AS item_name, cu.display_name AS created_by_name
	FROM preparations p
	LEFT JOIN users pu ON pu.id = p.person_id
	LEFT JOIN users cu ON cu.id = p.created_by
	LEFT JOIN items i ON i.id = p.item_id`;

/** @param {string} start @returns {Preparation[]} */
export function listWeekPreparations(start) {
	return /** @type {any} */ (
		db()
			.prepare(`${SELECT} WHERE p.date BETWEEN ? AND ? ORDER BY p.date, p.id`)
			.all(start, addDays(start, 6))
	);
}

/** @param {number} id @returns {Preparation | undefined} */
export function getPreparation(id) {
	return /** @type {any} */ (db().prepare(`${SELECT} WHERE p.id = ?`).get(id));
}

/**
 * @param {{ date: string, title: string, notes: string, person_id: number | null }} d
 * @param {number} userId
 */
export function addPreparation(d, userId) {
	const res = db()
		.prepare(
			`INSERT INTO preparations (date, title, notes, person_id, created_by, updated_by)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(d.date, d.title, d.notes, d.person_id, userId, userId);
	return Number(res.lastInsertRowid);
}

/**
 * @param {number} id
 * @param {{ date: string, title: string, notes: string, person_id: number | null }} d
 * @param {number} userId
 */
export function updatePreparation(id, d, userId) {
	return transaction(() => {
		const res = db()
			.prepare(
				`UPDATE preparations SET date = ?, title = ?, notes = ?, person_id = ?, updated_by = ?,
				   updated_at = datetime('now') WHERE id = ?`
			)
			.run(d.date, d.title, d.notes, d.person_id, userId, id);
		// As refeições ainda sem item acompanham o novo nome.
		db().prepare('UPDATE plan_entries SET title = ? WHERE prep_id = ? AND item_id IS NULL').run(d.title, id);
		return res.changes > 0;
	});
}

/** Preparações por fazer (para escolher ao planear uma refeição), da mais próxima para a mais distante. @param {string} from */
export function listOpenPreparations(from) {
	return /** @type {{ id: number, date: string, title: string }[]} */ (
		db()
			.prepare(
				`SELECT id, date, title FROM preparations
				 WHERE status = 'planned' AND date >= ? ORDER BY date, id`
			)
			.all(from)
	);
}

/** Copia a preparação para outros dias (fica por fazer). @param {number} id @param {string[]} dates @param {number} userId */
export function duplicatePreparation(id, dates, userId) {
	return transaction(() => {
		const p = getPreparation(id);
		if (!p) return 0;
		for (const date of dates) {
			addPreparation({ date, title: p.title, notes: p.notes, person_id: p.person_id }, userId);
		}
		return dates.length;
	});
}

/** @param {number} id */
export function removePreparation(id) {
	return db().prepare('DELETE FROM preparations WHERE id = ?').run(id).changes > 0;
}

/** Itens com o mesmo nome (para juntar as doses em vez de criar um item novo). @param {string} title */
export function itemsNamed(title) {
	return /** @type {{ id: number, name: string, quantity: number, location: string }[]} */ (
		db()
			.prepare(
				`SELECT id, name, quantity, location FROM items
				 WHERE archived = 0 AND name = ? COLLATE NOCASE ORDER BY id DESC`
			)
			.all(title.trim())
	);
}

/**
 * Confirma a preparação: desconta os ingredientes e cria um item novo, soma as
 * doses a um existente, ou (target 'none') não põe nada no inventário.
 * @param {number} id
 * @param {{ units: number, target: number | null | 'none', name: string, category: string, location: string,
 *   stored_on: string, best_before: string | null, notes: string }} d
 * @param {number} userId
 */
export function completePreparation(id, d, userId) {
	return transaction(() => {
		const prep = getPreparation(id);
		if (!prep || prep.status === 'done') return false;
		consumeIngredients(id);
		if (d.target === 'none') {
			db()
				.prepare(
					`UPDATE preparations SET status = 'done', item_id = NULL, units_added = 0, updated_by = ?,
					   updated_at = datetime('now') WHERE id = ?`
				)
				.run(userId, id);
			return true;
		}
		let itemId = d.target;
		let created = 0;
		if (itemId != null) {
			const res = db()
				.prepare(
					`UPDATE items SET quantity = ROUND(quantity + ?, 2), stored_on = ?, archived = 0, updated_by = ?,
					   updated_at = datetime('now') WHERE id = ?`
				)
				.run(d.units, d.stored_on, userId, itemId);
			if (!res.changes) throw new Error('Item não encontrado.');
		} else {
			const res = db()
				.prepare(
					`INSERT INTO items (name, category, location, quantity, stored_on, best_before, notes, created_by, updated_by)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(d.name, d.category, d.location, d.units, d.stored_on, d.best_before, d.notes, userId, userId);
			itemId = Number(res.lastInsertRowid);
			created = 1;
		}
		db()
			.prepare(
				`UPDATE preparations SET status = 'done', item_id = ?, units_added = ?, created_item = ?, updated_by = ?,
				   updated_at = datetime('now') WHERE id = ?`
			)
			.run(itemId, d.units, created, userId, id);
		// Refeições já planeadas com esta preparação passam a usar o item (contam no stock);
		// as que já foram comidas descontam agora.
		db().prepare('UPDATE plan_entries SET item_id = ? WHERE prep_id = ?').run(itemId, id);
		const eaten = /** @type {{ id: number, units: number }[]} */ (
			db().prepare(`SELECT id, units FROM plan_entries WHERE prep_id = ? AND status = 'eaten' ORDER BY date, id`).all(id)
		);
		for (const e of eaten) {
			db().prepare('UPDATE plan_entries SET deducted = ? WHERE id = ?').run(takeStock(itemId, e.units), e.id);
		}
		return true;
	});
}

/** Desfaz a confirmação: retira as doses que tinham sido somadas (sem descer abaixo de 0). @param {number} id @param {number} userId */
export function undoPreparation(id, userId) {
	return transaction(() => {
		const prep = getPreparation(id);
		if (!prep || prep.status !== 'done') return false;
		restoreIngredients(id);
		if (prep.item_id != null) {
			// Devolve o que as refeições comidas tinham descontado e retira as doses que a preparação somou.
			const back = /** @type {{ n: number }} */ (
				db().prepare(`SELECT COALESCE(SUM(deducted), 0) AS n FROM plan_entries WHERE prep_id = ? AND status = 'eaten'`).get(id)
			).n;
			returnStock(prep.item_id, back);
			takeStock(prep.item_id, prep.units_added);
			db().prepare('UPDATE plan_entries SET item_id = NULL, deducted = 0 WHERE prep_id = ?').run(id);
			// O item criado por esta preparação desaparece, se nada mais o usar.
			if (prep.created_item) {
				db()
					.prepare(
						`DELETE FROM items WHERE id = ? AND quantity = 0
						   AND NOT EXISTS (SELECT 1 FROM plan_entries WHERE item_id = items.id)
						   AND NOT EXISTS (SELECT 1 FROM prep_ingredients WHERE item_id = items.id)
						   AND NOT EXISTS (SELECT 1 FROM preparations WHERE item_id = items.id AND id != ?)`
					)
					.run(prep.item_id, id);
			}
		}
		db()
			.prepare(
				`UPDATE preparations SET status = 'planned', item_id = NULL, units_added = 0, created_item = 0, updated_by = ?,
				   updated_at = datetime('now') WHERE id = ?`
			)
			.run(userId, id);
		return true;
	});
}

// ——— Ingredientes (itens do inventário usados na preparação) ———

/**
 * @typedef {{ id: number, prep_id: number, item_id: number, units: number, consumed: number,
 *   thawed: number, name: string, location: string, free: number }} Ingredient
 */

/** @param {number[]} prepIds @returns {Ingredient[]} */
export function listIngredients(prepIds) {
	if (!prepIds.length) return [];
	return /** @type {any} */ (
		db()
			.prepare(
				`SELECT g.*, s.name, s.location, s.free FROM prep_ingredients g
				 JOIN item_stock s ON s.id = g.item_id
				 WHERE g.prep_id IN (${prepIds.map(() => '?').join(',')}) ORDER BY g.id`
			)
			.all(...prepIds)
	);
}

/** @param {number} prepId @param {number} itemId @param {number} units */
export function addIngredient(prepId, itemId, units) {
	const prep = getPreparation(prepId);
	if (!prep || prep.status !== 'planned') return false;
	db().prepare('INSERT INTO prep_ingredients (prep_id, item_id, units) VALUES (?, ?, ?)').run(prepId, itemId, units);
	return true;
}

/** @param {number} id ingrediente @param {number} prepId */
export function removeIngredient(id, prepId) {
	return (
		db()
			.prepare(
				`DELETE FROM prep_ingredients WHERE id = ? AND prep_id = ?
				   AND prep_id IN (SELECT id FROM preparations WHERE status = 'planned')`
			)
			.run(id, prepId).changes > 0
	);
}

/** Desconta os ingredientes do stock (guarda quanto foi mesmo descontado). @param {number} prepId */
function consumeIngredients(prepId) {
	const rows = /** @type {{ id: number, item_id: number, units: number }[]} */ (
		db().prepare('SELECT id, item_id, units FROM prep_ingredients WHERE prep_id = ? ORDER BY id').all(prepId)
	);
	for (const g of rows) {
		db().prepare('UPDATE prep_ingredients SET consumed = ? WHERE id = ?').run(takeStock(g.item_id, g.units), g.id);
	}
}

/** Repõe no stock o que os ingredientes tinham descontado. @param {number} prepId */
function restoreIngredients(prepId) {
	const rows = /** @type {{ id: number, item_id: number, consumed: number }[]} */ (
		db().prepare('SELECT id, item_id, consumed FROM prep_ingredients WHERE prep_id = ?').all(prepId)
	);
	for (const g of rows) {
		if (g.consumed > 0) {
			db()
				.prepare(`UPDATE items SET quantity = ROUND(quantity + ?, 2), updated_at = datetime('now') WHERE id = ?`)
				.run(g.consumed, g.item_id);
		}
		db().prepare('UPDATE prep_ingredients SET consumed = 0 WHERE id = ?').run(g.id);
	}
}

/** Refeições planeadas com estas preparações. @param {number[]} prepIds */
export function listPrepMeals(prepIds) {
	if (!prepIds.length) return [];
	/** @typedef {{ id: number, prep_id: number, date: string, slot: string, units: number, status: string,
	 *   person_id: number | null, person_name: string | null, person_color: string | null }} PrepMeal */
	return /** @type {PrepMeal[]} */ (
		db()
			.prepare(
				`SELECT p.id, p.prep_id, p.date, p.slot, p.units, p.status, p.person_id,
				        u.display_name AS person_name, u.color AS person_color
				 FROM plan_entries p LEFT JOIN users u ON u.id = p.person_id
				 WHERE p.prep_id IN (${prepIds.map(() => '?').join(',')}) ORDER BY p.date, p.slot`
			)
			.all(...prepIds)
	);
}
