import { db } from '$lib/server/db.js';

export function GET() {
	db().prepare('SELECT 1').get();
	return new Response('ok', { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
}
