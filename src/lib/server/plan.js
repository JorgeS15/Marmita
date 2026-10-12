import { db, transaction } from './db.js';
import { addDays } from '$lib/dates.js';
import { SLOT_DEADLINE_HOUR, SLOT_VALUES } from '$lib/constants.js';
import { ValidationError } from './validate.js';

/**
 * @typedef {object} PlanEntry
 * @property {number} id
 * @property {string} date
 * @property {string} slot
 * @property {number} position
 * @property {number | null} item_id
 * @property {string | null} title
 * @property {number} units
 * @property {'planned' | 'eaten' | 'skipped'} status
 * @property {string} notes
 * @property {number | null} person_id
 * @property {string | null} person_name
 * @property {string | null} person_color
 * @property {string | null} created_by_name
 * @property {string | null} updated_by_name
 * @property {number | null} item_free
 * @property {number | null} item_quantity
 * @property {number | null} item_archived
 * @property {string | null} item_notes
 * @property {string | null} item_location
 * @property {number | null} prep_id
 * @property {string | null} prep_date
 * @property {string | null} prep_status
 * @property {number} thawed
 */

const SELECT = `
	SELECT p.id, p.date, p.slot, p.position, p.item_id, COALESCE(s.name, p.title) AS title,
	       p.units, p.status, p.notes, p.person_id,
	       pu.display_name AS person_name, pu.color AS person_color,
	       cu.display_name AS created_by_name, uu.display_name AS updated_by_name,
	       s.free AS item_free, s.quantity AS item_quantity, s.archived AS item_archived,
	       s.notes AS item_notes, s.location AS item_location,
	       p.prep_id, pr.date AS prep_date, pr.status AS prep_status, p.thawed
	FROM plan_entries p
	LEFT JOIN item_stock s ON s.id = p.item_id
	LEFT JOIN preparations pr ON pr.id = p.prep_id
	LEFT JOIN users pu ON pu.id = p.person_id
	LEFT JOIN users cu ON cu.id = p.created_by
	LEFT JOIN users uu ON uu.id = p.updated_by`;

const SLOT_ORDER = `CASE p.slot ${SLOT_VALUES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} END`;
const ORDER = `ORDER BY p.date, ${SLOT_ORDER}, p.position, p.id`;

/** @param {string} start primeiro dia da semana @returns {PlanEntry[]} */
export function listWeek(start) {
	return /** @type {any} */ (
		db()
			.prepare(`${SELECT} WHERE p.date BETWEEN ? AND ? ${ORDER}`)
			.all(start, addDays(start, 6))
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
	// Slots de hoje cuja hora-limite já passou.
	const passed = Object.entries(SLOT_DEADLINE_HOUR)
		.filter(([, hour]) => now.hour >= hour)
		.map(([slot]) => slot);
	const todayClause = passed.length
		? `OR (p.date = ? AND p.slot IN (${passed.map(() => '?').join(', ')}))`
		: '';
	return /** @type {any} */ (
		db()
			.prepare(`${SELECT} WHERE p.status = 'planned' AND (p.date < ? ${todayClause}) ${ORDER} LIMIT 100`)
			.all(now.date, ...(passed.length ? [now.date, ...passed] : []))
	);
}

/**
 * O que tem de sair do congelador hoje ou amanhã: refeições planeadas e
 * ingredientes de preparações por fazer.
 * @param {string} today
 * @returns {{ kind: 'entry' | 'ingredient', id: number, date: string, slot: string | null,
 *   title: string, units: number, person_color: string | null, prep_title: string | null }[]}
 */
export function listToThaw(today) {
	const tomorrow = addDays(today, 1);
	const entries = /** @type {any[]} */ (
		db()
			.prepare(
				`${SELECT}
				 WHERE p.status = 'planned' AND p.thawed = 0 AND s.location = 'congelador'
				   AND p.date BETWEEN ? AND ?
				 ${ORDER}`
			)
			.all(today, tomorrow)
	).map((e) => ({ kind: 'entry', id: e.id, date: e.date, slot: e.slot, title: e.title, units: e.units,
		person_color: e.person_color, prep_title: null }));
	const ingredients = /** @type {any[]} */ (
		db()
			.prepare(
				`SELECT g.id, pr.date, i.name AS title, g.units, u.color AS person_color, pr.title AS prep_title
				 FROM prep_ingredients g
				 JOIN preparations pr ON pr.id = g.prep_id
				 JOIN items i ON i.id = g.item_id
				 LEFT JOIN users u ON u.id = pr.person_id
				 WHERE pr.status = 'planned' AND g.thawed = 0 AND i.location = 'congelador'
				   AND pr.date BETWEEN ? AND ?
				 ORDER BY pr.date, g.id`
			)
			.all(today, tomorrow)
	).map((g) => ({ kind: 'ingredient', slot: null, ...g }));
	return [...entries, ...ingredients].sort((a, b) => a.date.localeCompare(b.date));
}

/** @param {number} id @param {boolean} thawed */
export function setIngredientThawed(id, thawed) {
	return db().prepare('UPDATE prep_ingredients SET thawed = ? WHERE id = ?').run(thawed ? 1 : 0, id).changes > 0;
}

/**
 * Com as confirmações desligadas: as refeições que já passaram contam como comidas.
 * @param {{ date: string, hour: number }} now
 */
export function autoConsume(now) {
	let n = 0;
	for (const e of listPending(now)) {
		if (setStatus(e.id, 'eaten', null)) n++;
	}
	return n;
}

/** Marca (ou desmarca) a refeição como já tirada do congelador. @param {number} id @param {boolean} thawed @param {number} userId */
export function setThawed(id, thawed, userId) {
	return (
		db()
			.prepare(`UPDATE plan_entries SET thawed = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
			.run(thawed ? 1 : 0, userId, id).changes > 0
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
 * @param {{ date: string, slot: string, item_id: number | null, prep_id?: number | null, title: string | null, units: number, notes: string, person_id: number | null }} d
 * @param {number} userId
 */
export function addEntry(d, userId) {
	return transaction(() => {
		let title = d.title;
		let itemId = d.item_id;
		const prepId = d.prep_id ?? null;
		if (prepId != null) {
			// Refeição feita com uma preparação: se já foi confirmada, liga logo ao item criado.
			const prep = /** @type {{ title: string, item_id: number | null, status: string } | undefined} */ (
				db().prepare('SELECT title, item_id, status FROM preparations WHERE id = ?').get(prepId)
			);
			if (!prep) throw new ValidationError('Essa preparação já não existe.');
			title = prep.title;
			if (prep.status === 'done' && prep.item_id != null) itemId = prep.item_id;
		}
		if (itemId != null) {
			const item = /** @type {{ name: string } | undefined} */ (
				db().prepare('SELECT name FROM items WHERE id = ?').get(itemId)
			);
			if (!item) throw new ValidationError('Esse item já não existe.');
			title = item.name;
		}
		const res = db()
			.prepare(
				`INSERT INTO plan_entries (date, slot, position, item_id, prep_id, title, units, notes, person_id, created_by, updated_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(d.date, d.slot, nextPosition(d.date, d.slot), itemId, prepId, title, d.units, d.notes, d.person_id, userId, userId);
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
		.prepare(`UPDATE items SET quantity = ROUND(MAX(0, quantity + ?), 2), updated_at = datetime('now') WHERE id = ?`)
		.run(delta, itemId);
}

/**
 * Edita doses, notas, pessoa e (no texto livre) o título.
 * Se a entrada já foi comida, o stock acompanha a diferença de doses.
 * @param {number} id
 * @param {{ units: number, notes: string, person_id: number | null, title?: string | null }} d
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
				`UPDATE plan_entries SET units = ?, notes = ?, person_id = ?, title = COALESCE(?, title),
				   updated_by = ?, updated_at = datetime('now') WHERE id = ?`
			)
			.run(d.units, d.notes, d.person_id, setTitle, userId, id);
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
 * @param {number | null} userId
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

/**
 * Copia a refeição para outros dias (mesma comida, doses, pessoa e nota; fica "planeada").
 * @param {number} id
 * @param {string[]} dates
 * @param {string} slot
 * @param {number} userId
 */
export function duplicateEntry(id, dates, slot, userId) {
	return transaction(() => {
		const e = /** @type {any} */ (db().prepare('SELECT * FROM plan_entries WHERE id = ?').get(id));
		if (!e) return 0;
		const insert = db().prepare(
			`INSERT INTO plan_entries (date, slot, position, item_id, prep_id, title, units, notes, person_id, created_by, updated_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		);
		for (const date of dates) {
			insert.run(date, slot, nextPosition(date, slot), e.item_id, e.prep_id, e.title, e.units, e.notes, e.person_id, userId, userId);
		}
		return dates.length;
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
		plan_entries: db().prepare('SELECT * FROM plan_entries ORDER BY date, slot, position, id').all(),
		preparations: db().prepare('SELECT * FROM preparations ORDER BY date, id').all(),
		ideas: db().prepare('SELECT * FROM ideas ORDER BY id').all(),
		settings: db().prepare('SELECT * FROM settings ORDER BY key').all()
	};
}
