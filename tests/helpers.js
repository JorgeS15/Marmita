import { db } from '$lib/server/db.js';
import { createItem, getItem } from '$lib/server/items.js';

let users = 0;

/** Cria um utilizador diretamente na BD (sem hash: os testes de auth tratam disso). */
export function user(name = `u${++users}`) {
	const res = db()
		.prepare(`INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, 'x')`)
		.run(name, name);
	return Number(res.lastInsertRowid);
}

/** @param {Partial<import('$lib/server/items.js').ItemInput>} [d] @param {number} [userId] */
export function item(d = {}, userId = 1) {
	return createItem(
		{
			name: 'Item',
			category: 'outro',
			location: 'congelador',
			quantity: 1,
			stored_on: null,
			best_before: null,
			notes: '',
			...d
		},
		userId
	);
}

/** Stock de um item: { quantity, planned, free }. @param {number} id */
export function stock(id) {
	const i = getItem(id);
	if (!i) throw new Error(`item ${id} não existe`);
	return { quantity: i.quantity, planned: i.planned, free: i.free };
}

/** FormData a partir de um objeto (valores repetidos como array). @param {Record<string, string | string[]>} o */
export function form(o) {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
	return f;
}
