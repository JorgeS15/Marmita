import { db } from './db.js';

/** Definições partilhadas por toda a casa, com os valores por omissão. */
const DEFAULTS = {
	/** Há lanche da manhã? Se não, o lanche da tarde passa a chamar-se "Lanche". */
	morning_snack: '1',
	/** Pedir confirmação do que foi comido? Se não, as refeições passadas contam como comidas. */
	confirmations: '1'
};

/** @typedef {{ morningSnack: boolean, confirmations: boolean }} Settings */

/** @returns {Settings} */
export function getSettings() {
	const rows = /** @type {{ key: string, value: string }[]} */ (
		db().prepare('SELECT key, value FROM settings').all()
	);
	/** @type {Record<string, string>} */
	const map = { ...DEFAULTS };
	for (const r of rows) map[r.key] = r.value;
	return { morningSnack: map.morning_snack === '1', confirmations: map.confirmations === '1' };
}

/** Valor "cru" de uma definição (ou undefined). @param {string} key */
export function getRawSetting(key) {
	const row = /** @type {{ value: string } | undefined} */ (
		db().prepare('SELECT value FROM settings WHERE key = ?').get(key)
	);
	return row?.value;
}

/** @param {string} key @param {string} value */
export function setSetting(key, value) {
	db()
		.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
		.run(key, value);
}
