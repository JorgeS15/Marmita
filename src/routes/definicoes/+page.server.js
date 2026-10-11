import { fail } from '@sveltejs/kit';
import {
	createUser,
	deleteOtherSessions,
	findUserById,
	findUserByUsername,
	listUsers,
	setColor,
	setDisplayName,
	setPassword,
	verifyPassword
} from '$lib/server/auth.js';
import { guard } from '$lib/server/forms.js';
import { oneOf, text } from '$lib/server/validate.js';
import { PERSON_COLORS } from '$lib/constants.js';
import { setSetting } from '$lib/server/settings.js';
import { validateNewUser, validatePassword } from '$lib/server/users.js';

/** @type {import('./$types').PageServerLoad} */
export function load() {
	return { users: listUsers() };
}

/** @type {import('./$types').Actions} */
export const actions = {
	house: async ({ request }) => {
		const form = await request.formData();
		setSetting('morning_snack', form.get('morning_snack') === '1' ? '1' : '0');
		return { section: 'house', ok: 'Definições da casa guardadas.' };
	},

	profile: ({ request, locals }) =>
		guard(
			async () => {
				const form = await request.formData();
				const name = text(form, 'display_name', { required: true, max: 60, label: 'Nome' });
				const color = oneOf(form, 'color', PERSON_COLORS.map((c) => c.value), {
					fallback: locals.user.color || PERSON_COLORS[0].value,
					label: 'Cor'
				});
				setDisplayName(locals.user.id, name);
				setColor(locals.user.id, color);
				return { section: 'profile', ok: 'Perfil atualizado.' };
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
