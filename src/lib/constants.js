export const CATEGORIES = /** @type {const} */ ([
	{ value: 'carne', label: 'Carne' },
	{ value: 'peixe', label: 'Peixe' },
	{ value: 'vegetariano', label: 'Vegetariano' },
	{ value: 'sopa', label: 'Sopa' },
	{ value: 'massa_arroz', label: 'Massa/Arroz' },
	{ value: 'sobremesa', label: 'Sobremesa' },
	{ value: 'pequeno_almoco', label: 'Pequeno-almoço' },
	{ value: 'lanche', label: 'Lanche' },
	{ value: 'outro', label: 'Outro' }
]);

export const LOCATIONS = /** @type {const} */ ([
	{ value: 'congelador', label: 'Congelador' },
	{ value: 'frigorifico', label: 'Frigorífico' },
	{ value: 'despensa', label: 'Despensa' }
]);

/** Refeições do dia, por ordem. `minor` = pequeno-almoço e lanches (mostrados de forma compacta). */
export const SLOTS = /** @type {const} */ ([
	{ value: 'pequeno_almoco', label: 'Pequeno-almoço', short: 'P. almoço', minor: true },
	{ value: 'lanche_manha', label: 'Lanche da manhã', short: 'Lanche manhã', minor: true },
	{ value: 'almoco', label: 'Almoço', short: 'Almoço', minor: false },
	{ value: 'lanche_tarde', label: 'Lanche da tarde', short: 'Lanche tarde', minor: true },
	{ value: 'jantar', label: 'Jantar', short: 'Jantar', minor: false }
]);

export const SLOT_VALUES = SLOTS.map((s) => s.value);

/** Cores disponíveis para as pessoas da casa. */
export const PERSON_COLORS = /** @type {const} */ ([
	{ value: '#2563eb', label: 'Azul' },
	{ value: '#db2777', label: 'Rosa' },
	{ value: '#16a34a', label: 'Verde' },
	{ value: '#9333ea', label: 'Roxo' },
	{ value: '#ea580c', label: 'Laranja' },
	{ value: '#0891b2', label: 'Ciano' }
]);

export const STATUSES = /** @type {const} */ ([
	{ value: 'planned', label: 'Planeada' },
	{ value: 'eaten', label: 'Comida' },
	{ value: 'skipped', label: 'Não comida' }
]);

/** Hora (local) a partir da qual um slot de hoje passa a "por confirmar". */
export const SLOT_DEADLINE_HOUR = {
	pequeno_almoco: 11,
	lanche_manha: 12,
	almoco: 15,
	lanche_tarde: 18,
	jantar: 22
};

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
