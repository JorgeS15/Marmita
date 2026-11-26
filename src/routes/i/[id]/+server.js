import { redirect } from '@sveltejs/kit';

/**
 * Endereço curto usado no código QR das etiquetas: /i/123 → /inventario/123.
 * Curto para o QR ficar pequeno (e com módulos maiores, mais fáceis de ler).
 * @type {import('./$types').RequestHandler}
 */
export function GET({ params }) {
	const id = Number(params.id);
	redirect(303, Number.isInteger(id) && id > 0 ? `/inventario/${id}` : '/inventario');
}
