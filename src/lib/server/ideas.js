import { db } from './db.js';

/**
 * @typedef {{ id: number, title: string, body: string, created_by_name: string | null,
 *   updated_by_name: string | null, created_at: string, updated_at: string }} Idea
 */

const SELECT = `
	SELECT n.*, cu.display_name AS created_by_name, uu.display_name AS updated_by_name
	FROM ideas n
	LEFT JOIN users cu ON cu.id = n.created_by
	LEFT JOIN users uu ON uu.id = n.updated_by`;

/** Mais recentes primeiro. @returns {Idea[]} */
export function listIdeas() {
	return /** @type {any} */ (db().prepare(`${SELECT} ORDER BY n.updated_at DESC, n.id DESC`).all());
}

/** @param {number} id @returns {Idea | undefined} */
export function getIdea(id) {
	return /** @type {any} */ (db().prepare(`${SELECT} WHERE n.id = ?`).get(id));
}

/** @param {{ title: string, body: string }} d @param {number} userId */
export function createIdea(d, userId) {
	const res = db()
		.prepare('INSERT INTO ideas (title, body, created_by, updated_by) VALUES (?, ?, ?, ?)')
		.run(d.title, d.body, userId, userId);
	return Number(res.lastInsertRowid);
}

/** @param {number} id @param {{ title: string, body: string }} d @param {number} userId */
export function updateIdea(id, d, userId) {
	return (
		db()
			.prepare(`UPDATE ideas SET title = ?, body = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
			.run(d.title, d.body, userId, id).changes > 0
	);
}

/** @param {number} id */
export function deleteIdea(id) {
	return db().prepare('DELETE FROM ideas WHERE id = ?').run(id).changes > 0;
}
