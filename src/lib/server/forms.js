import { fail } from '@sveltejs/kit';
import { ValidationError } from './validate.js';

/**
 * Corre uma ação; erros de validação viram `fail(400, { ...extra, error })`.
 * @template T
 * @param {() => T | Promise<T>} fn
 * @param {Record<string, unknown>} [extra] dados a juntar à resposta de erro
 */
export async function guard(fn, extra = {}) {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof ValidationError) return fail(400, { ...extra, error: err.message });
		throw err;
	}
}

/** Caminho interno seguro para redirecionar (evita open redirects). @param {unknown} next */
export function safeNext(next) {
	if (typeof next !== 'string' || !next.startsWith('/')) return '/';
	// "/\evil.com" e caracteres de controlo são lidos pelo browser como "//evil.com".
	if (/[\\\u0000-\u001f\u007f]/.test(next) || next.startsWith('//')) return '/';
	return next;
}
