import { fail } from '@sveltejs/kit';
import {
	createUser,
	deleteOtherSessions,
	findUserById,
	findUserByUsername,
	listUsers,
	setDisplayName,
	setPassword,
	verifyPassword
} from '$lib/server/auth.js';
import { guard } from '$lib/server/forms.js';
import { text } from '$lib/server/validate.js';
import { validateNewUser, validatePassword } from '$lib/server/users.js';

/** @type {import('./$types').PageServerLoad} */
export function load() {
	return { users: listUsers(), version: __APP_VERSION__ };
}

/** @type {import('./$types').Actions} */
export const actions = {
	profile: ({ request, locals }) =>
		guard(
			async () => {
				const form = await request.formData();
				const name = text(form, 'display_name', { required: true, max: 60, label: 'Nome' });
				setDisplayName(locals.user.id, name);
				return { section: 'profile', ok: 'Nome atualizado.' };
			},
			{ section: 'profile' }
		),

	password: ({ request, locals }) =>
		guard(
			async () => {
				const form = await request.formData();
				const user = findUserById(locals.user.id);
				const current = String(form.get('current') ?? '');
				if (!user || !(await verifyPassword(current, user.password_hash))) {
					return fail(400, { section: 'password', error: 'A palavra-passe atual está errada.' });
				}
				const password = validatePassword(form, 'password', 'password_confirm');
				await setPassword(user.id, password);
				deleteOtherSessions(user.id, locals.sessionId);
				return { section: 'password', ok: 'Palavra-passe alterada. As outras sessões foram terminadas.' };
			},
			{ section: 'password' }
		),

	addUser: ({ request }) =>
		guard(
			async () => {
				const form = await request.formData();
				const data = validateNewUser(form);
				if (findUserByUsername(data.username)) {
					return fail(400, { section: 'addUser', error: 'Esse nome de utilizador já existe.' });
				}
				await createUser(data);
				return { section: 'addUser', ok: `Conta "${data.username}" criada.` };
			},
			{ section: 'addUser' }
		)
};
