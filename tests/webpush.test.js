import { describe, expect, test } from 'vitest';
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { encryptPayload, generateVapidKeys, vapidAuthorization } from '$lib/server/webpush.js';

const hmac = (/** @type {Buffer} */ k, /** @type {Buffer} */ d) => createHmac('sha256', k).update(d).digest();
const hkdf = (/** @type {Buffer} */ salt, /** @type {Buffer} */ ikm, /** @type {Buffer} */ info, /** @type {number} */ len) =>
	hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

describe('web push', () => {
	test('a mensagem cifrada decifra-se do lado do browser (RFC 8291)', () => {
		// "browser"
		const ua = createECDH('prime256v1');
		const uaPublic = ua.generateKeys();
		const auth = randomBytes(16);
		const body = encryptPayload(JSON.stringify({ title: 'Olá 🍲' }), {
			p256dh: uaPublic.toString('base64url'),
			auth: auth.toString('base64url')
		});

		const salt = body.subarray(0, 16);
		expect(body.readUInt32BE(16)).toBe(4096);
		const idlen = body[20];
		const asPublic = body.subarray(21, 21 + idlen);
		const ciphertext = body.subarray(21 + idlen);

		const secret = ua.computeSecret(asPublic);
		const ikm = hkdf(auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
		const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
		const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
		const d = createDecipheriv('aes-128-gcm', cek, nonce);
		d.setAuthTag(ciphertext.subarray(-16));
		const plain = Buffer.concat([d.update(ciphertext.subarray(0, -16)), d.final()]);
		expect(plain.at(-1)).toBe(2);
		expect(JSON.parse(plain.subarray(0, -1).toString('utf8'))).toEqual({ title: 'Olá 🍲' });
	});

	test('cabeçalho VAPID com JWT ES256 válido para o serviço de push', () => {
		const keys = generateVapidKeys();
		const auth = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { ...keys, subject: 'mailto:a@b.pt' });
		const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth);
		expect(m).not.toBeNull();
		const [, h, p, sig, k] = /** @type {RegExpExecArray} */ (m);
		expect(k).toBe(keys.publicKey);
		const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
		expect(payload.aud).toBe('https://fcm.googleapis.com');
		expect(payload.sub).toBe('mailto:a@b.pt');
		expect(payload.exp).toBeGreaterThan(Date.now() / 1000);

		const raw = Buffer.from(keys.publicKey, 'base64url');
		const pub = createPublicKey({
			key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') },
			format: 'jwk'
		});
		const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
		expect(ok).toBe(true);
	});
});
