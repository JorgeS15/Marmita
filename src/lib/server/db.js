import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

/**
 * Migrações embutidas no bundle (o build final não leva a pasta src/).
 * Chave: caminho do ficheiro; valor: conteúdo SQL.
 * @type {Record<string, string>}
 */
const migrationFiles = import.meta.glob('./migrations/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
});

/** @param {DatabaseSync} db */
function migrate(db) {
	const migrations = Object.entries(migrationFiles)
		.map(([path, sql]) => {
			const name = path.split('/').pop() ?? '';
			return { version: Number.parseInt(name, 10), name, sql };
		})
		.filter((m) => Number.isInteger(m.version) && m.version > 0)
		.sort((a, b) => a.version - b.version);

	const row = /** @type {{ user_version: number }} */ (db.prepare('PRAGMA user_version').get());
	let current = row.user_version;

	for (const m of migrations) {
		if (m.version <= current) continue;
		db.exec('BEGIN');
		try {
			db.exec(m.sql);
			db.exec(`PRAGMA user_version = ${m.version}`);
			db.exec('COMMIT');
			current = m.version;
			console.log(`[db] migração aplicada: ${m.name}`);
		} catch (err) {
			db.exec('ROLLBACK');
			throw err;
		}
	}
}

function open() {
	const dir = env.DATA_DIR || './data';
	mkdirSync(dir, { recursive: true });
	const db = new DatabaseSync(join(dir, 'marmita.db'));
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec('PRAGMA busy_timeout = 5000');
	db.exec('PRAGMA synchronous = NORMAL');
	migrate(db);
	return db;
}

/** @type {DatabaseSync | undefined} */
let instance;

/** Ligação única à base de dados (aberta e migrada no primeiro uso). */
export function db() {
	instance ??= open();
	return instance;
}

/**
 * Corre `fn` numa transação. Faz rollback se lançar exceção.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function transaction(fn) {
	const d = db();
	d.exec('BEGIN IMMEDIATE');
	try {
		const result = fn();
		d.exec('COMMIT');
		return result;
	} catch (err) {
		d.exec('ROLLBACK');
		throw err;
	}
}
