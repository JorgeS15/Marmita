// Web Push sem dependências: cifra RFC 8291 (aes128gcm) + autenticação VAPID (RFC 8292).
import { createCipheriv, createECDH, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

/** @param {Buffer | Uint8Array} buf */
const b64url = (buf) => Buffer.from(buf).toString('base64url');
/** @param {string} s */
const fromB64url = (s) => Buffer.from(s, 'base64url');

/** HMAC-SHA256 @param {Buffer} key @param {Buffer} data */
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** HKDF (RFC 5869) com um único bloco de saída (≤ 32 bytes). @param {Buffer} salt @param {Buffer} ikm @param {Buffer} info @param {number} length */
function hkdf(salt, ikm, info, length) {
	const prk = hmac(salt, ikm);
	return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

/**
 * Gera um par de chaves VAPID (P-256).
 * @returns {{ publicKey: string, privateJwk: string }} publicKey em base64url (ponto não comprimido)
 */
export function generateVapidKeys() {
	const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	const jwk = publicKey.export({ format: 'jwk' });
	const raw = Buffer.concat([Buffer.from([4]), fromB64url(/** @type {string} */ (jwk.x)), fromB64url(/** @type {string} */ (jwk.y))]);
	return { publicKey: b64url(raw), privateJwk: JSON.stringify(privateKey.export({ format: 'jwk' })) };
}

/**
 * Cabeçalho Authorization VAPID para o serviço de push do endpoint.
 * @param {string} endpoint
 * @param {{ publicKey: string, privateJwk: string, subject: string }} vapid
 */
export function vapidAuthorization(endpoint, vapid) {
	const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const payload = b64url(
		Buffer.from(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(Date.now() / 1000) + 12 * 3600,
				sub: vapid.subject
			})
		)
	);
	const key = createPrivateKey({ key: JSON.parse(vapid.privateJwk), format: 'jwk' });
	const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
	return `vapid t=${header}.${payload}.${b64url(signature)}, k=${vapid.publicKey}`;
}

/**
 * Cifra a mensagem para a subscrição (Content-Encoding: aes128gcm).
 * @param {string} payload texto (normalmente JSON)
 * @param {{ p256dh: string, auth: string }} keys chaves da subscrição (base64url)
 * @returns {Buffer}
 */
export function encryptPayload(payload, keys) {
	const uaPublic = fromB64url(keys.p256dh);
	const authSecret = fromB64url(keys.auth);

	const ecdh = createECDH('prime256v1');
	const asPublic = ecdh.generateKeys();
	const ecdhSecret = ecdh.computeSecret(uaPublic);

	const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
	const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);

	const salt = randomBytes(16);
	const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
	const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

	// Um único registo: dados + delimitador 0x02 (último registo, sem padding).
	const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]);
	const cipher = createCipheriv('aes-128-gcm', cek, nonce);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

	const rs = Buffer.alloc(4);
	rs.writeUInt32BE(4096);
	return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ciphertext]);
}

/**
 * Envia uma mensagem push. Devolve o estado HTTP do serviço de push.
 * 201/202 = aceite; 404/410 = subscrição expirada (deve ser apagada).
 * @param {{ endpoint: string, p256dh: string, auth: string }} sub
 * @param {object} message
 * @param {{ publicKey: string, privateJwk: string, subject: string }} vapid
 * @param {{ ttl?: number, urgency?: 'very-low' | 'low' | 'normal' | 'high', topic?: string }} [opts]
 */
export async function sendPush(sub, message, vapid, opts = {}) {
	const body = encryptPayload(JSON.stringify(message), sub);
	/** @type {Record<string, string>} */
	const headers = {
		'content-encoding': 'aes128gcm',
		'content-type': 'application/octet-stream',
		ttl: String(opts.ttl ?? 12 * 3600),
		urgency: opts.urgency ?? 'normal',
		authorization: vapidAuthorization(sub.endpoint, vapid)
	};
	if (opts.topic) headers.topic = opts.topic;
	const res = await fetch(sub.endpoint, { method: 'POST', headers, body: new Uint8Array(body), signal: AbortSignal.timeout(15_000) });
	return { status: res.status, body: res.ok ? '' : (await res.text()).slice(0, 300) };
}
