/** Filtros da lista do inventário que se mantêm ao abrir um item e voltar. */
const KEYS = ['q', 'local', 'categoria', 'arquivados'];

/**
 * Endereço da lista do inventário com os filtros que vêm em `voltar`
 * (texto do tipo "local=congelador&q=sopa"). Ignora tudo o resto.
 * @param {unknown} voltar
 */
export function inventoryHref(voltar) {
	const from = new URLSearchParams(typeof voltar === 'string' ? voltar : '');
	const out = new URLSearchParams();
	for (const k of KEYS) {
		const v = from.get(k);
		if (v != null) out.set(k, v.slice(0, 100));
	}
	const qs = out.toString().replace(/=(&|$)/g, '$1');
	return `/inventario${qs ? `?${qs}` : ''}`;
}
