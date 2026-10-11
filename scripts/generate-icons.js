// Gera os ícones PNG da PWA sem dependências (node scripts/generate-icons.js).
// Desenho: uma marmita (caixa com tampa e pega) sobre fundo laranja.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const OUT = new URL('../static/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [0xc2, 0x41, 0x0c];
const BODY = [0xff, 0xf7, 0xed];
const LID = [0xfe, 0xd7, 0xaa];
const LATCH = [0x9a, 0x34, 0x12];

/** Distância a um retângulo arredondado (negativa dentro). */
function roundRect(px, py, x0, y0, x1, y1, r) {
	const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
	const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
	const dx = Math.abs(px - cx) - hx, dy = Math.abs(py - cy) - hy;
	return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Cor (RGBA) num ponto do desenho em coordenadas 0..512. */
function shade(x, y, { rounded, scale }) {
	// Fundo
	if (rounded && roundRect(x, y, 0, 0, 512, 512, 112) > 0) return null;
	// Conteúdo (escalado à volta do centro para a versão maskable)
	const u = 256 + (x - 256) / scale, v = 256 + (y - 256) / scale + 14;
	// Pega (semi-anel por cima da tampa)
	const ring = Math.abs(Math.hypot(u - 256, v - 178) - 62) - 13;
	if (ring < 0 && v < 178) return LID;
	if (roundRect(u, v, 104, 168, 408, 228, 26) < 0) {
		if (roundRect(u, v, 232, 206, 280, 252, 10) < 0) return LATCH;
		return LID;
	}
	if (roundRect(u, v, 120, 216, 392, 404, 40) < 0) {
		if (roundRect(u, v, 232, 206, 280, 252, 10) < 0) return LATCH;
		return BODY;
	}
	return BG;
}

function render(size, opts) {
	const SS = 4;
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let j = 0; j < size; j++) {
		raw[j * (size * 4 + 1)] = 0;
		for (let i = 0; i < size; i++) {
			let r = 0, g = 0, b = 0, a = 0;
			for (let sy = 0; sy < SS; sy++)
				for (let sx = 0; sx < SS; sx++) {
					const c = shade(((i + (sx + 0.5) / SS) / size) * 512, ((j + (sy + 0.5) / SS) / size) * 512, opts);
					if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
				}
			const n = SS * SS, o = j * (size * 4 + 1) + 1 + i * 4;
			const cov = a / 255;
			raw[o] = cov ? Math.round(r / cov) : 0;
			raw[o + 1] = cov ? Math.round(g / cov) : 0;
			raw[o + 2] = cov ? Math.round(b / cov) : 0;
			raw[o + 3] = Math.round(a / n);
		}
	}
	return png(size, raw);
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}

function png(size, raw) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

const icons = [
	['icon-192.png', 192, { rounded: true, scale: 1 }],
	['icon-512.png', 512, { rounded: true, scale: 1 }],
	['icon-maskable-512.png', 512, { rounded: false, scale: 0.78 }],
	['apple-touch-icon.png', 180, { rounded: false, scale: 0.9 }]
];

for (const [name, size, opts] of icons) {
	writeFileSync(new URL(name, OUT), render(size, opts));
	console.log('ícone gerado:', name);
}
