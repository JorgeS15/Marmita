import { db, transaction } from './db.js';
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
 * @property {string | null} created_by_name
 */

const SELECT = `
	SELECT p.id, p.date, p.title, p.notes, p.person_id, p.status, p.item_id, p.units_added,
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
 * Confirma a preparação: cria um item novo ou soma as doses a um existente.
 * @param {number} id
 * @param {{ units: number, target: number | null, name: string, category: string, location: string,
 *   stored_on: string, best_before: string | null, notes: string }} d  target = item existente ou null (novo)
 * @param {number} userId
 */
export function completePreparation(id, d, userId) {
	return transaction(() => {
		const prep = getPreparation(id);
		if (!prep || prep.status === 'done') return false;
		let itemId = d.target;
		if (itemId != null) {
			const res = db()
				.prepare(
					`UPDATE items SET quantity = quantity + ?, stored_on = ?, archived = 0, updated_by = ?,
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
		}
		db()
			.prepare(
				`UPDATE preparations SET status = 'done', item_id = ?, units_added = ?, updated_by = ?,
				   updated_at = datetime('now') WHERE id = ?`
			)
			.run(itemId, d.units, userId, id);
		// Refeições já planeadas com esta preparação passam a usar o item (contam no stock).
		const eaten = /** @type {{ n: number }} */ (
			db()
				.prepare(`SELECT COALESCE(SUM(units), 0) AS n FROM plan_entries WHERE prep_id = ? AND status = 'eaten'`)
				.get(id)
		).n;
		db().prepare('UPDATE plan_entries SET item_id = ? WHERE prep_id = ?').run(itemId, id);
		if (eaten > 0) {
			db().prepare('UPDATE items SET quantity = MAX(0, quantity - ?) WHERE id = ?').run(eaten, itemId);
		}
		return true;
	});
}

/** Desfaz a confirmação: retira as doses que tinham sido somadas (sem descer abaixo de 0). @param {number} id @param {number} userId */
export function undoPreparation(id, userId) {
	return transaction(() => {
		const prep = getPreparation(id);
		if (!prep || prep.status !== 'done') return false;
		if (prep.item_id != null) {
			// Devolve as doses já comidas destas refeições e retira as que a preparação tinha somado.
			const eaten = /** @type {{ n: number }} */ (
				db()
					.prepare(`SELECT COALESCE(SUM(units), 0) AS n FROM plan_entries WHERE prep_id = ? AND status = 'eaten'`)
					.get(id)
			).n;
			db()
				.prepare(`UPDATE items SET quantity = MAX(0, quantity + ? - ?), updated_at = datetime('now') WHERE id = ?`)
				.run(eaten, prep.units_added, prep.item_id);
			db().prepare('UPDATE plan_entries SET item_id = NULL WHERE prep_id = ?').run(id);
		}
		db()
			.prepare(
				`UPDATE preparations SET status = 'planned', item_id = NULL, units_added = 0, updated_by = ?,
				   updated_at = datetime('now') WHERE id = ?`
			)
			.run(userId, id);
		return true;
	});
}
