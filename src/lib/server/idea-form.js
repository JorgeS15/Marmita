import { text } from './validate.js';

/** @param {FormData} form */
export function parseIdea(form) {
	return {
		title: text(form, 'title', { required: true, max: 150, label: 'Título' }),
		body: text(form, 'body', { max: 20000, label: 'Texto' })
	};
}
