import { ValidationError, text } from './validate.js';

/** Valida os campos de criação de um utilizador. @param {FormData} form */
export function validateNewUser(form) {
	const username = text(form, 'username', { required: true, max: 40, label: 'Utilizador' }).toLowerCase();
	if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
		throw new ValidationError('Utilizador: 2 a 40 caracteres (letras, números, ".", "_" ou "-").');
	}
	const display_name = text(form, 'display_name', { max: 60, label: 'Nome' }) || username;
	const password = validatePassword(form, 'password', 'password_confirm');
	return { username, display_name, password };
}

/** @param {FormData} form @param {string} key @param {string} confirmKey */
export function validatePassword(form, key, confirmKey) {
	const raw = form.get(key);
	const password = typeof raw === 'string' ? raw : '';
	if (password.length < 8) throw new ValidationError('A palavra-passe tem de ter pelo menos 8 caracteres.');
	if (password.length > 200) throw new ValidationError('A palavra-passe é demasiado longa.');
	if (form.get(confirmKey) !== password) throw new ValidationError('As palavras-passe não coincidem.');
	return password;
}
