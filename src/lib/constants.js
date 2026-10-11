export const CATEGORIES = /** @type {const} */ ([
	{ value: 'carne', label: 'Carne' },
	{ value: 'peixe', label: 'Peixe' },
	{ value: 'vegetariano', label: 'Vegetariano' },
	{ value: 'sopa', label: 'Sopa' },
	{ value: 'massa_arroz', label: 'Massa/Arroz' },
	{ value: 'sobremesa', label: 'Sobremesa' },
	{ value: 'outro', label: 'Outro' }
]);

export const LOCATIONS = /** @type {const} */ ([
	{ value: 'congelador', label: 'Congelador' },
	{ value: 'frigorifico', label: 'Frigorífico' },
	{ value: 'despensa', label: 'Despensa' }
]);

export const SLOTS = /** @type {const} */ ([
	{ value: 'almoco', label: 'Almoço' },
	{ value: 'jantar', label: 'Jantar' }
]);

export const STATUSES = /** @type {const} */ ([
	{ value: 'planned', label: 'Planeada' },
	{ value: 'eaten', label: 'Comida' },
	{ value: 'skipped', label: 'Não comida' }
]);

/** Hora (local) a partir da qual um slot de hoje passa a "por confirmar". */
export const SLOT_DEADLINE_HOUR = { almoco: 15, jantar: 22 };

/**
 * @param {ReadonlyArray<{ value: string, label: string }>} list
 * @param {string | null | undefined} value
 */
export function labelOf(list, value) {
	return list.find((x) => x.value === value)?.label ?? value ?? '';
}

/** Normaliza texto para pesquisa (minúsculas, sem acentos). @param {string} s */
export function normalize(s) {
	return (s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim();
}
