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
import { getSettings, setSetting } from '$lib/server/settings.js';
import { nowParts } from '$lib/dates.js';
import { listBackups } from '$lib/server/backup.js';
import { KINDS, countSubscriptions, getPrefs, setPrefs, vapid } from '$lib/server/notifications.js';
import { validateNewUser, validatePassword } from '$lib/server/users.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
	const userId = /** @type {NonNullable<typeof locals.user>} */ (locals.user).id;
	return {
		users: listUsers(),
		backups: listBackups(),
		push: {
			publicKey: vapid().publicKey,
			devices: countSubscriptions(userId),
			prefs: getPrefs(userId)
		}
	};
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @type {import('./$types').Actions} */
export const actions = {
	notifications: async ({ request, locals }) => {
		const form = await request.formData();
		/** @type {any} */
		const prefs = {};
		for (const kind of KINDS) {
			prefs[kind] = form.get(kind) === '1' ? 1 : 0;
			const time = String(form.get(`${kind}_time`) ?? '');
			if (!TIME_RE.test(time)) return fail(400, { section: 'notifications', error: 'Hora inválida.' });
			prefs[`${kind}_time`] = time;
		}
		setPrefs(locals.user.id, prefs);
		return { section: 'notifications', ok: 'Notificações guardadas.' };
	},

	house: async ({ request }) => {
		const form = await request.formData();
		setSetting('morning_snack', form.get('morning_snack') === '1' ? '1' : '0');
		setSetting('week_monday', form.get('week_monday') === '1' ? '1' : '0');
		const confirmations = form.get('confirmations') === '1';
		// Ao desligar, só as refeições a partir de hoje passam a contar como comidas sozinhas.
		if (!confirmations && getSettings().confirmations) setSetting('auto_consume_from', nowParts().date);
		setSetting('confirmations', confirmations ? '1' : '0');
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
				try {
					await createUser(data);
				} catch (err) {
					// Dois envios ao mesmo tempo: o segundo bate na restrição UNIQUE.
					if (/UNIQUE/.test(String(err))) return fail(400, { section: 'addUser', error: 'Esse nome de utilizador já existe.' });
					throw err;
				}
				return { section: 'addUser', ok: `Conta "${data.username}" criada.` };
			},
			{ section: 'addUser' }
		)
};
