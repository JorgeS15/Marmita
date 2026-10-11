import { db, transaction } from './db.js';
import { addDays } from '$lib/dates.js';
import { SLOT_DEADLINE_HOUR } from '$lib/constants.js';

/**
 * @typedef {object} PlanEntry
 * @property {number} id
 * @property {string} date
 * @property {'almoco' | 'jantar'} slot
 * @property {number} position
 * @property {number | null} item_id
 * @property {string | null} title
 * @property {number} units
 * @property {'planned' | 'eaten' | 'skipped'} status
 * @property {string} notes
 * @property {string | null} created_by_name
 * @property {string | null} updated_by_name
 * @property {number | null} item_free
 * @property {number | null} item_quantity
 * @property {number | null} item_archived
 */

const SELECT = `
	SELECT p.id, p.date, p.slot, p.position, p.item_id, COALESCE(s.name, p.title) AS title,
	       p.units, p.status, p.notes,
	       cu.display_name AS created_by_name, uu.display_name AS updated_by_name,
	       s.free AS item_free, s.quantity AS item_quantity, s.archived AS item_archived
	FROM plan_entries p
	LEFT JOIN item_stock s ON s.id = p.item_id
	LEFT JOIN users cu ON cu.id = p.created_by
	LEFT JOIN users uu ON uu.id = p.updated_by`;

const ORDER = `ORDER BY p.date, CASE p.slot WHEN 'almoco' THEN 0 ELSE 1 END, p.position, p.id`;

/** @param {string} monday @returns {PlanEntry[]} */
export function listWeek(monday) {
	return /** @type {any} */ (
		db()
			.prepare(`${SELECT} WHERE p.date BETWEEN ? AND ? ${ORDER}`)
			.all(monday, addDays(monday, 6))
	);
}

/** @param {number} id @returns {PlanEntry | undefined} */
export function getEntry(id) {
	return /** @type {any} */ (db().prepare(`${SELECT} WHERE p.id = ?`).get(id));
}

/**
 * Entradas "planned" cujo momento já passou e que esperam confirmação.
 * @param {{ date: string, hour: number }} now
 * @returns {PlanEntry[]}
 */
export function listPending(now) {
	return /** @type {any} */ (
		db()
			.prepare(
				`${SELECT}
				 WHERE p.status = 'planned'
				   AND (p.date < ?
				        OR (p.date = ? AND ((p.slot = 'almoco' AND ? >= ?) OR (p.slot = 'jantar' AND ? >= ?))))
				 ${ORDER} LIMIT 100`
			)
			.all(now.date, now.date, now.hour, SLOT_DEADLINE_HOUR.almoco, now.hour, SLOT_DEADLINE_HOUR.jantar)
	);
}

/** @param {string} date @param {string} slot */
function nextPosition(date, slot) {
	const row = /** @type {{ p: number }} */ (
		db()
			.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM plan_entries WHERE date = ? AND slot = ?')
			.get(date, slot)
	);
	return row.p;
}

/**
 * @param {{ date: string, slot: string, item_id: number | null, title: string | null, units: number, notes: string }} d
 * @param {number} userId
 */
export function addEntry(d, userId) {
	return transaction(() => {
		let title = d.title;
		if (d.item_id != null) {
			const item = /** @type {{ name: string } | undefined} */ (
				db().prepare('SELECT name FROM items WHERE id = ?').get(d.item_id)
			);
			if (!item) throw new Error('Item não encontrado.');
			title = item.name;
		}
		const res = db()
			.prepare(
				`INSERT INTO plan_entries (date, slot, position, item_id, title, units, notes, created_by, updated_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(d.date, d.slot, nextPosition(d.date, d.slot), d.item_id, title, d.units, d.notes, userId, userId);
		return Number(res.lastInsertRowid);
	});
}

/** @param {number} id */
function rawEntry(id) {
	return /** @type {{ id: number, item_id: number | null, units: number, status: string, date: string, slot: string } | undefined} */ (
		db().prepare('SELECT id, item_id, units, status, date, slot FROM plan_entries WHERE id = ?').get(id)
	);
}

/** @param {number | null} itemId @param {number} delta */
function changeStock(itemId, delta) {
	if (itemId == null || delta === 0) return;
	db()
		.prepare(`UPDATE items SET quantity = MAX(0, quantity + ?), updated_at = datetime('now') WHERE id = ?`)
		.run(delta, itemId);
}

/**
 * Edita doses, notas e (no texto livre) o título.
 * Se a entrada já foi comida, o stock acompanha a diferença de doses.
 * @param {number} id
 * @param {{ units: number, notes: string, title?: string | null }} d
 * @param {number} userId
 */
export function updateEntry(id, d, userId) {
	return transaction(() => {
		const e = rawEntry(id);
		if (!e) return false;
		if (e.status === 'eaten') changeStock(e.item_id, e.units - d.units);
		const setTitle = e.item_id == null && d.title ? d.title : null;
		db()
			.prepare(
				`UPDATE plan_entries SET units = ?, notes = ?, title = COALESCE(?, title),
				   updated_by = ?, updated_at = datetime('now') WHERE id = ?`
			)
			.run(d.units, d.notes, setTitle, userId, id);
		return true;
	});
}

/** @param {number} id @param {string} date @param {string} slot @param {number} userId */
export function moveEntry(id, date, slot, userId) {
	return transaction(() => {
		const e = rawEntry(id);
		if (!e) return false;
		if (e.date === date && e.slot === slot) return true;
		db()
			.prepare(
				`UPDATE plan_entries SET date = ?, slot = ?, position = ?, updated_by = ?, updated_at = datetime('now')
				 WHERE id = ?`
			)
			.run(date, slot, nextPosition(date, slot), userId, id);
		return true;
	});
}

/**
 * Muda o estado e acerta o stock:
 *  - passar a "eaten" desconta as doses (sem descer abaixo de 0);
 *  - sair de "eaten" repõe as doses.
 * @param {number} id
 * @param {'planned' | 'eaten' | 'skipped'} status
 * @param {number} userId
 */
export function setStatus(id, status, userId) {
	return transaction(() => {
		const e = rawEntry(id);
		if (!e) return false;
		if (e.status === status) return true;
		let delta = 0;
		if (e.status === 'eaten') delta += e.units;
		if (status === 'eaten') delta -= e.units;
		changeStock(e.item_id, delta);
		db()
			.prepare(`UPDATE plan_entries SET status = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
			.run(status, userId, id);
		return true;
	});
}

/** Remove a entrada. Se estava planeada, a dose volta a ficar livre. @param {number} id */
export function removeEntry(id) {
	return db().prepare('DELETE FROM plan_entries WHERE id = ?').run(id).changes > 0;
}

/** Export completo para backup. */
export function exportAll() {
	return {
		items: db().prepare('SELECT * FROM items ORDER BY id').all(),
		plan_entries: db().prepare('SELECT * FROM plan_entries ORDER BY date, slot, position, id').all()
	};
}
