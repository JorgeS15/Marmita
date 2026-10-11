import { isISODate } from '$lib/dates.js';

/** Erro de validação com mensagem para o utilizador. */
export class ValidationError extends Error {}

/**
 * @param {FormData} form
 * @param {string} key
 * @param {{ required?: boolean, max?: number, label?: string }} [opts]
 */
export function text(form, key, { required = false, max = 200, label = key } = {}) {
	const raw = form.get(key);
	const value = typeof raw === 'string' ? raw.trim() : '';
	if (required && !value) throw new ValidationError(`${label}: campo obrigatório.`);
	if (value.length > max) throw new ValidationError(`${label}: máximo de ${max} caracteres.`);
	return value;
}

/**
 * @param {FormData} form
 * @param {string} key
 * @param {{ min?: number, max?: number, fallback?: number, label?: string }} [opts]
 */
export function int(form, key, { min = 0, max = 9999, fallback, label = key } = {}) {
	const raw = form.get(key);
	const s = typeof raw === 'string' ? raw.trim() : '';
	if (s === '' && fallback !== undefined) return fallback;
	if (!/^-?\d+$/.test(s)) throw new ValidationError(`${label}: tem de ser um número inteiro.`);
	const n = Number(s);
	if (n < min || n > max) throw new ValidationError(`${label}: entre ${min} e ${max}.`);
	return n;
}

/**
 * Número decimal (aceita vírgula ou ponto), arredondado a 2 casas.
 * @param {FormData} form
 * @param {string} key
 * @param {{ min?: number, max?: number, fallback?: number, label?: string }} [opts]
 */
export function num(form, key, { min = 0, max = 9999, fallback, label = key } = {}) {
	const raw = form.get(key);
	const s = typeof raw === 'string' ? raw.trim().replace(',', '.') : '';
	if (s === '' && fallback !== undefined) return fallback;
	if (!/^\d+(\.\d+)?$/.test(s)) throw new ValidationError(`${label}: tem de ser um número.`);
	const n = Math.round(Number(s) * 100) / 100;
	if (n < min || n > max) {
		throw new ValidationError(`${label}: entre ${String(min).replace('.', ',')} e ${String(max).replace('.', ',')}.`);
	}
	return n;
}

/**
 * Data ISO opcional ("" → null).
 * @param {FormData} form
 * @param {string} key
 * @param {{ required?: boolean, label?: string }} [opts]
 */
export function date(form, key, { required = false, label = key } = {}) {
	const raw = form.get(key);
	const s = typeof raw === 'string' ? raw.trim() : '';
	if (!s) {
		if (required) throw new ValidationError(`${label}: campo obrigatório.`);
		return null;
	}
	if (!isISODate(s)) throw new ValidationError(`${label}: data inválida.`);
	return s;
}

/**
 * @template {string} T
 * @param {FormData} form
 * @param {string} key
 * @param {readonly T[]} allowed
 * @param {{ fallback?: T, label?: string }} [opts]
 * @returns {T}
 */
export function oneOf(form, key, allowed, { fallback, label = key } = {}) {
	const raw = form.get(key);
	const s = typeof raw === 'string' ? raw.trim() : '';
	if (!s && fallback !== undefined) return fallback;
	if (!allowed.includes(/** @type {T} */ (s))) throw new ValidationError(`${label}: valor inválido.`);
	return /** @type {T} */ (s);
}

/** @param {FormData} form @param {string} key */
export function id(form, key = 'id') {
	return int(form, key, { min: 1, max: Number.MAX_SAFE_INTEGER, label: 'id' });
}
