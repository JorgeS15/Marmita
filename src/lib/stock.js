import { agoLabel, daysBetween } from './dates.js';

/**
 * Indicadores de antiguidade/validade de um item.
 * @param {{ location: string, stored_on: string | null, best_before: string | null }} item
 * @param {string} today
 */
export function itemFlags(item, today) {
	const expired = !!item.best_before && item.best_before < today;
	const daysLeft = item.best_before ? daysBetween(today, item.best_before) : null;
	const expiringSoon = !expired && daysLeft !== null && daysLeft <= 7;
	const age = item.stored_on ? daysBetween(item.stored_on, today) : null;
	const old = item.location === 'congelador' && age !== null && age > 90;
	const verb = item.location === 'congelador' ? 'Congelado' : 'Guardado';
	const ageText = item.stored_on ? `${verb} ${agoLabel(item.stored_on, today)}` : '';
	let expiryText = '';
	if (expired) expiryText = 'Validade ultrapassada';
	else if (daysLeft === 0) expiryText = 'Consumir hoje';
	else if (daysLeft === 1) expiryText = 'Consumir até amanhã';
	else if (expiringSoon) expiryText = `Consumir em ${daysLeft} dias`;
	return { expired, expiringSoon, old, ageText, expiryText };
}
