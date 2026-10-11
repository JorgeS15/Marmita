import { exportAll } from '$lib/server/plan.js';
import { listUsers } from '$lib/server/auth.js';
import { today } from '$lib/dates.js';

/** @type {import('./$types').RequestHandler} */
export function GET() {
	const body = {
		app: 'marmita',
		version: __APP_VERSION__,
		exported_at: new Date().toISOString(),
		users: listUsers(),
		...exportAll()
	};
	return new Response(JSON.stringify(body, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="marmita-${today()}.json"`,
			'cache-control': 'no-store'
		}
	});
}
