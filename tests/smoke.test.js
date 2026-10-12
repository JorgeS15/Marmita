import { test, expect } from 'vitest';
import { db } from '$lib/server/db.js';

test('abre e migra uma BD temporária', () => {
	const { user_version } = /** @type {any} */ (db().prepare('PRAGMA user_version').get());
	expect(user_version).toBeGreaterThanOrEqual(7);
	const main = /** @type {any[]} */ (db().prepare('PRAGMA database_list').all()).find((d) => d.name === 'main');
	expect(main.file).toContain('marmita-test-');
});
