// Datas guardadas como "YYYY-MM-DD" (data local, sem horas).
// Internamente usam-se objetos Date em UTC à meia-noite, para evitar
// surpresas com fusos e horário de verão.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** @param {unknown} s @returns {s is string} */
export function isISODate(s) {
	if (typeof s !== 'string') return false;
	const m = ISO_RE.exec(s);
	if (!m) return false;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** @param {string} iso */
function toUTC(iso) {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

/** @param {Date} date */
function fromUTC(date) {
	return date.toISOString().slice(0, 10);
}

/** @param {string} iso @param {number} n */
export function addDays(iso, n) {
	return fromUTC(new Date(toUTC(iso).getTime() + n * DAY_MS));
}

/** Diferença em dias (b − a). @param {string} a @param {string} b */
export function daysBetween(a, b) {
	return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}

/** Primeiro dia (domingo) da semana que contém `iso`. @param {string} iso */
export function weekStartOf(iso) {
	return addDays(iso, -toUTC(iso).getUTCDay()); // getUTCDay: 0 = domingo
}

/**
 * Data e hora atuais no fuso indicado (por omissão, o do processo/navegador).
 * @param {string} [timeZone]
 * @returns {{ date: string, hour: number, minute: number }}
 */
export function nowParts(timeZone) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date());
	/** @param {string} t */
	const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
	return {
		date: `${get('year')}-${get('month')}-${get('day')}`,
		hour: Number(get('hour')),
		minute: Number(get('minute'))
	};
}

/** @param {string} [timeZone] */
export function today(timeZone) {
	return nowParts(timeZone).date;
}

/** @param {Intl.DateTimeFormatOptions} opts */
const fmt = (opts) => new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', ...opts });

const fmtWeekday = fmt({ weekday: 'long' });

// Abreviaturas fixas: o Intl em pt-PT devolve "13/10" para { day, month: 'short' }.
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];


/** "segunda-feira" @param {string} iso */
export function weekdayName(iso) {
	return fmtWeekday.format(toUTC(iso));
}

/** "Segunda-feira" @param {string} iso */
export function weekdayTitle(iso) {
	const name = weekdayName(iso);
	return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "seg" @param {string} iso */
export function weekdayShort(iso) {
	return WEEKDAYS[toUTC(iso).getUTCDay()];
}

/** "13 out" @param {string} iso */
export function dayMonth(iso) {
	const d = toUTC(iso);
	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "13 out 2026" @param {string | null | undefined} iso */
export function fullDate(iso) {
	if (!iso || !isISODate(iso)) return '';
	return `${dayMonth(iso)} ${iso.slice(0, 4)}`;
}

/** "12–18 out" ou "28 set – 4 out" @param {string} start primeiro dia (domingo) */
export function weekRange(start) {
	const end = addDays(start, 6);
	const a = toUTC(start);
	const b = toUTC(end);
	if (a.getUTCMonth() === b.getUTCMonth()) {
		return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
	}
	return `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** Os 7 dias (domingo a sábado) da semana que começa em `start`. @param {string} start */
export function weekDays(start) {
	return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Texto curto para há quanto tempo: "hoje", "há 3 dias", "há 2 sem.", "há 4 meses".
 * @param {string} from @param {string} to
 */
export function agoLabel(from, to) {
	const d = daysBetween(from, to);
	if (d <= 0) return 'hoje';
	if (d === 1) return 'ontem';
	if (d < 14) return `há ${d} dias`;
	if (d < 60) return `há ${Math.floor(d / 7)} sem.`;
	if (d < 365) return `há ${Math.floor(d / 30)} meses`;
	const years = Math.floor(d / 365);
	return years === 1 ? 'há 1 ano' : `há ${years} anos`;
}
