import { db, transaction } from './db.js';
import { ValidationError } from './validate.js';
import { doses } from '$lib/constants.js';

/**
 * @typedef {object} ItemStock
 * @property {number} id
 * @property {string} name
 * @property {string} category
 * @property {string} location
 * @property {number} quantity
 * @property {string | null} stored_on
 * @property {string | null} best_before
 * @property {string} notes
 * @property {number} archived
 * @property {number} planned
 * @property {number} free
 * @property {string | null} created_by_name
 * @property {string | null} updated_by_name
 * @property {string} created_at
 * @property {string} updated_at
 */

const SELECT = `
	SELECT s.*, cu.display_name AS created_by_name, uu.display_name AS updated_by_name
	FROM item_stock s
	LEFT JOIN users cu ON cu.id = s.created_by
	LEFT JOIN users uu ON uu.id = s.updated_by`;

/** Itens com stock, ordenados pelo mais antigo primeiro. @param {{ archived?: boolean }} [opts] @returns {ItemStock[]} */
export function listItems({ archived = false } = {}) {
	return /** @type {any} */ (
		db()
			.prepare(
				`${SELECT} WHERE s.archived = ?
				 ORDER BY s.stored_on IS NULL, s.stored_on, s.name COLLATE NOCASE, s.id`
			)
			.all(archived ? 1 : 0)
	);
}

/** @param {number} id @returns {ItemStock | undefined} */
export function getItem(id) {
	return /** @type {any} */ (db().prepare(`${SELECT} WHERE s.id = ?`).get(id));
}

/**
 * @typedef {{ name: string, category: string, location: string, quantity: number,
 *   stored_on: string | null, best_before: string | null, notes: string }} ItemInput
 */

/** @param {ItemInput} d @param {number} userId */
export function createItem(d, userId) {
	const res = db()
		.prepare(
			`INSERT INTO items (name, category, location, quantity, stored_on, best_before, notes, created_by, updated_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(d.name, d.category, d.location, d.quantity, d.stored_on, d.best_before, d.notes, userId, userId);
	return Number(res.lastInsertRowid);
}

/** @param {number} id @param {ItemInput} d @param {number} userId */
export function updateItem(id, d, userId) {
	return transaction(() => {
		const res = db()
			.prepare(
				`UPDATE items SET name = ?, category = ?, location = ?, quantity = ?, stored_on = ?,
				   best_before = ?, notes = ?, updated_by = ?, updated_at = datetime('now')
				 WHERE id = ?`
			)
			.run(d.name, d.category, d.location, d.quantity, d.stored_on, d.best_before, d.notes, userId, id);
		// Mantém a cópia do nome nas entradas do plano ainda por comer.
		db()
			.prepare(`UPDATE plan_entries SET title = ? WHERE item_id = ? AND status = 'planned'`)
			.run(d.name, id);
		return res.changes > 0;
	});
}

/** +1 / −1 (nunca abaixo de 0). @param {number} id @param {number} delta @param {number} userId */
export function adjustQuantity(id, delta, userId) {
	const res = db()
		.prepare(
			`UPDATE items SET quantity = ROUND(MAX(0, quantity + ?), 2), updated_by = ?, updated_at = datetime('now')
			 WHERE id = ?`
		)
		.run(delta, userId, id);
	return res.changes > 0;
}

/** @param {number} id @param {boolean} archived @param {number} userId */
export function setArchived(id, archived, userId) {
	const res = db()
		.prepare(`UPDATE items SET archived = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
		.run(archived ? 1 : 0, userId, id);
	return res.changes > 0;
}

/** Apaga o item definitivamente (as entradas do plano ficam com o título copiado). @param {number} id */
export function deleteItem(id) {
	return db().prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
}

/** Próximas entradas planeadas para o item. @param {number} id */
export function plannedEntriesFor(id) {
	return /** @type {{ id: number, date: string, slot: string, units: number, status: string }[]} */ (
		db()
			.prepare(
				`SELECT id, date, slot, units, status FROM plan_entries
				 WHERE item_id = ? AND status = 'planned'
				 ORDER BY date, slot, position`
			)
			.all(id)
	);
}

/**
 * Passa doses de um item para outro local (ex.: 2 doses do frigorífico para o
 * congelador, ou 1 do congelador para o frigorífico para descongelar).
 * Junta-se a um item com o mesmo nome nesse local, se houver; senão cria-o.
 * As refeições planeadas acompanham as doses: as mais próximas quando vão para
 * o frigorífico/despensa, as mais distantes quando vão para o congelador.
 * @param {number} id
 * @param {{ units: number, location: string, best_before: string | null }} d
 * @param {number} userId
 * @returns {number | null} id do item de destino (null se o item não existe)
 */
export function moveDoses(id, d, userId) {
	return transaction(() => {
		const src = /** @type {any} */ (db().prepare('SELECT * FROM items WHERE id = ?').get(id));
		if (!src) return null;
		if (src.location === d.location) throw new ValidationError('Escolhe outro local.');
		if (d.units > src.quantity + 1e-9) throw new ValidationError(`Só há ${doses(src.quantity)}.`);
		const existing = /** @type {{ id: number } | undefined} */ (
			db()
				.prepare(`SELECT id FROM items WHERE archived = 0 AND name = ? COLLATE NOCASE AND location = ? ORDER BY id DESC LIMIT 1`)
				.get(src.name, d.location)
		);
		let target;
		if (existing) {
			target = existing.id;
			db()
				.prepare(
					`UPDATE items SET quantity = ROUND(quantity + ?, 2), best_before = COALESCE(?, best_before),
					   updated_by = ?, updated_at = datetime('now') WHERE id = ?`
				)
				.run(d.units, d.best_before, userId, target);
		} else {
			const res = db()
				.prepare(
					`INSERT INTO items (name, category, location, quantity, stored_on, best_before, notes, created_by, updated_by)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(src.name, src.category, d.location, d.units, src.stored_on, d.best_before, src.notes, userId, userId);
			target = Number(res.lastInsertRowid);
		}
		db()
			.prepare(`UPDATE items SET quantity = ROUND(quantity - ?, 2), updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
			.run(d.units, userId, id);

		const latestFirst = d.location === 'congelador';
		const planned = /** @type {{ id: number, units: number }[]} */ (
			db()
				.prepare(
					`SELECT id, units FROM plan_entries WHERE item_id = ? AND status = 'planned'
					 ORDER BY date ${latestFirst ? 'DESC' : 'ASC'}, id ${latestFirst ? 'DESC' : 'ASC'}`
				)
				.all(id)
		);
		let left = d.units;
		for (const e of planned) {
			if (e.units > left + 1e-9) break;
			left -= e.units;
			db().prepare('UPDATE plan_entries SET item_id = ?, thawed = 0 WHERE id = ?').run(target, e.id);
		}
		return target;
	});
}
