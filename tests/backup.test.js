import { expect, test } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dailyBackup, freshCopy, listBackups } from '$lib/server/backup.js';
import { item, user } from './helpers.js';

test('cópia diária consistente e rotação das antigas (BACKUP_KEEP=3)', () => {
	item({ name: 'Para o backup' }, user());
	const dir = join(/** @type {string} */ (process.env.DATA_DIR), 'backups');
	mkdirSync(dir, { recursive: true });
	for (const d of ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04']) writeFileSync(join(dir, `marmita-${d}.db`), '');
	writeFileSync(join(dir, 'outro-ficheiro.txt'), 'não mexer');

	dailyBackup();
	const names = listBackups().map((b) => b.name);
	expect(names).toHaveLength(3);
	expect(names.slice(1)).toEqual(['marmita-2020-01-04.db', 'marmita-2020-01-03.db']);
	expect(existsSync(join(dir, 'outro-ficheiro.txt'))).toBe(true);

	const copy = new DatabaseSync(join(dir, names[0]), { readOnly: true });
	expect(copy.prepare(`SELECT name FROM items WHERE name = 'Para o backup'`).get()).toBeTruthy();
	copy.close();

	dailyBackup(); // só uma por dia
	expect(listBackups()).toHaveLength(3);
});

test('cópia para descarregar', () => {
	const file = freshCopy();
	const copy = new DatabaseSync(file, { readOnly: true });
	expect(copy.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 8 });
	copy.close();
});
