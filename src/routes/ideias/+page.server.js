import { listIdeas } from '$lib/server/ideas.js';

/** @type {import('./$types').PageServerLoad} */
export function load() {
	return { ideas: listIdeas() };
}
