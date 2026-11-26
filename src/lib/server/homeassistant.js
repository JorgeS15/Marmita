// Impressão de etiquetas através do Home Assistant, com a integração
// hass-marklife (https://github.com/eigger/hass-marklife): o HA liga-se à
// etiquetadora por Bluetooth (adaptador local ou proxy ESPHome).
//
// A etiqueta é desenhada no browser (o mesmo PNG da pré-visualização) e vai
// para o HA como imagem (`dlimg` com um URL `data:`), por isso sai igual à
// impressão por Bluetooth direto. O token só existe no servidor.

import { env } from '$env/dynamic/private';
import { getRawSetting, setSetting } from './settings.js';

/** Tempo máximo à espera do HA: só responde depois de a etiqueta sair. */
const PRINT_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_MS = 8_000;

export class HomeAssistantError extends Error {}

/** URL (sem "/" final) e token, ou null se não estiver configurado. */
export function haConfig() {
	const url = (env.HA_URL ?? '').trim().replace(/\/+$/, '');
	const token = (env.HA_TOKEN ?? '').trim();
	if (!url || !token) return null;
	return { url, token };
}

/**
 * @param {string} path
 * @param {{ body?: unknown, timeoutMs?: number }} [opts]
 */
async function call(path, opts = {}) {
	const cfg = haConfig();
	if (!cfg) throw new HomeAssistantError('O Home Assistant não está configurado (HA_URL e HA_TOKEN).');
	let res;
	try {
		res = await fetch(`${cfg.url}${path}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(opts.body ?? {}),
			signal: AbortSignal.timeout(opts.timeoutMs ?? QUERY_TIMEOUT_MS)
		});
	} catch (err) {
		const e = /** @type {any} */ (err);
		if (e?.name === 'TimeoutError') throw new HomeAssistantError('O Home Assistant não respondeu a tempo.');
		throw new HomeAssistantError(`Não foi possível ligar ao Home Assistant (${cfg.url}).`);
	}
	const text = await res.text();
	if (res.status === 401 || res.status === 403) throw new HomeAssistantError('O token do Home Assistant não é válido.');
	if (res.status === 404 || (res.status === 400 && /not found/i.test(text))) {
		throw new HomeAssistantError('O Home Assistant não tem a integração Marklife instalada.');
	}
	if (!res.ok) {
		// O HA devolve a mensagem do erro em texto ou em JSON ({ message }).
		let msg = text;
		try {
			msg = JSON.parse(text).message ?? text;
		} catch {
			// texto simples
		}
		msg = String(msg).replace(/^\d{3}:\s*/, '').trim().slice(0, 300);
		throw new HomeAssistantError(msg ? `Home Assistant: ${msg}` : `O Home Assistant respondeu com erro ${res.status}.`);
	}
	return text;
}

/**
 * Template que lista as etiquetadoras da integração Marklife (uma por dispositivo).
 * Devolve JSON: [{ "id": "...", "name": "..." }].
 */
const PRINTERS_TEMPLATE = `{%- set ns = namespace(out=[]) -%}
{%- for d in integration_entities('marklife') | map('device_id') | reject('none') | unique -%}
{%- set ns.out = ns.out + [{'id': d, 'name': device_attr(d, 'name_by_user') or device_attr(d, 'name') or d}] -%}
{%- endfor -%}
{{ ns.out | tojson }}`;

/** @returns {Promise<{ id: string, name: string }[]>} */
export async function listPrinters() {
	const text = await call('/api/template', { body: { template: PRINTERS_TEMPLATE } });
	let list;
	try {
		list = JSON.parse(text);
	} catch {
		throw new HomeAssistantError('Resposta inesperada do Home Assistant.');
	}
	if (!Array.isArray(list)) return [];
	return list
		.filter((p) => p && typeof p.id === 'string')
		.map((p) => ({ id: p.id, name: String(p.name ?? p.id) }))
		.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}

/** Etiquetadora escolhida para a casa (em Definições). */
export function getHaPrinter() {
	const id = getRawSetting('label_ha_device') ?? '';
	return id ? { id, name: getRawSetting('label_ha_device_name') || id } : null;
}

/** @param {{ id: string, name: string } | null} printer */
export function setHaPrinter(printer) {
	setSetting('label_ha_device', printer?.id ?? '');
	setSetting('label_ha_device_name', printer?.name ?? '');
}

/**
 * @typedef {{ png: string, width: number, height: number, copies: number, density: number, flip: boolean }} HaLabel
 *   `png`: só o base64 (sem o prefixo `data:`); `width` × `height`: a etiqueta deitada, em pontos.
 */

/**
 * Corpo do pedido `marklife.print`: a imagem ocupa a etiqueta toda e é rodada
 * para seguir o papel (90° no sentido horário; 270° com "Rodar 180°"), tal como
 * no Bluetooth direto.
 * @param {string} deviceId @param {HaLabel} label
 */
export function printBody(deviceId, label) {
	return {
		device_id: deviceId,
		payload: [
			{
				type: 'dlimg',
				url: `data:image/png;base64,${label.png}`,
				x: 0,
				y: 0,
				xsize: label.width,
				ysize: label.height
			}
		],
		width: label.width,
		height: label.height,
		rotate: label.flip ? 270 : 90,
		density: label.density,
		copies: label.copies,
		paper_type: 'gap'
	};
}

/** Imprime na etiquetadora escolhida. Só volta quando a etiqueta saiu (ou falhou). @param {HaLabel} label */
export async function printViaHa(label) {
	const printer = getHaPrinter();
	if (!printer) throw new HomeAssistantError('Escolhe a etiquetadora do Home Assistant em Definições.');
	await call('/api/services/marklife/print', { body: printBody(printer.id, label), timeoutMs: PRINT_TIMEOUT_MS });
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_PNG_BYTES = 200_000;

/**
 * Valida o pedido do browser.
 * @param {any} body
 * @returns {HaLabel}
 */
export function parseLabelRequest(body) {
	const bad = (/** @type {string} */ msg) => new HomeAssistantError(msg);
	if (!body || typeof body !== 'object') throw bad('Pedido inválido.');
	const prefix = 'data:image/png;base64,';
	if (typeof body.png !== 'string' || !body.png.startsWith(prefix)) throw bad('Imagem inválida.');
	const b64 = body.png.slice(prefix.length);
	if (b64.length > (MAX_PNG_BYTES * 4) / 3 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw bad('Imagem inválida.');
	const bytes = Buffer.from(b64, 'base64');
	if (bytes.length < 24 || PNG_SIGNATURE.some((v, i) => bytes[i] !== v)) throw bad('Imagem inválida.');
	// Dimensões reais da imagem (cabeçalho IHDR) têm de bater com as declaradas.
	const pngW = bytes.readUInt32BE(16);
	const pngH = bytes.readUInt32BE(20);
	const int = (/** @type {unknown} */ v, /** @type {number} */ min, /** @type {number} */ max) =>
		Number.isInteger(v) && /** @type {number} */ (v) >= min && /** @type {number} */ (v) <= max;
	if (!int(body.width, 8, 1600) || !int(body.height, 8, 384) || pngW !== body.width || pngH !== body.height) {
		throw bad('Tamanho da etiqueta inválido.');
	}
	if (!int(body.copies, 1, 20)) throw bad('Cópias: de 1 a 20.');
	if (!int(body.density, 1, 3)) throw bad('Densidade inválida.');
	return { png: b64, width: body.width, height: body.height, copies: body.copies, density: body.density, flip: body.flip === true };
}
