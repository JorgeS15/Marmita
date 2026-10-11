import { readFileSync, rmSync } from 'node:fs';
import { freshCopy } from '$lib/server/backup.js';
import { today } from '$lib/dates.js';

/** Descarrega uma cópia consistente da base de dados (pode substituir data/marmita.db). */
export function GET() {
	const file = freshCopy();
	try {
		const body = readFileSync(file);
		return new Response(body, {
			headers: {
				'content-type': 'application/vnd.sqlite3',
				'content-disposition': `attachment; filename="marmita-${today()}.db"`,
				'cache-control': 'no-store'
			}
		});
	} finally {
		rmSync(file, { force: true });
	}
}
