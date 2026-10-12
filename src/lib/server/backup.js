import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '$env/dynamic/private';
import { db } from './db.js';
import { today } from '$lib/dates.js';

const PREFIX = 'marmita-';
const SUFFIX = '.db';

function backupDir() {
	return join(env.DATA_DIR || './data', 'backups');
}

/** Quantas cópias diárias manter (0 desliga as cópias automáticas). */
function keep() {
	const n = Number.parseInt(env.BACKUP_KEEP ?? '14', 10);
	return Number.isInteger(n) && n >= 0 ? n : 14;
}

/**
 * Escreve uma cópia consistente da base de dados (VACUUM INTO) em `file`.
 * Escreve primeiro num ficheiro temporário: uma cópia a meio (disco cheio…) nunca fica com o nome final.
 * @param {string} file
 */
function snapshot(file) {
	const tmp = `${file}.tmp`;
	rmSync(tmp, { force: true });
	try {
		db().exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
		renameSync(tmp, file);
	} finally {
		rmSync(tmp, { force: true });
	}
}

/** Lista as cópias automáticas, mais recentes primeiro. */
export function listBackups() {
	try {
		return readdirSync(backupDir())
			.filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
			.sort()
			.reverse()
			.map((name) => ({ name, size: statSync(join(backupDir(), name)).size }));
	} catch {
		return [];
	}
}

/** Faz a cópia de hoje (se ainda não existir) e apaga as mais antigas. */
export function dailyBackup() {
	if (keep() === 0) return;
	try {
		mkdirSync(backupDir(), { recursive: true });
		const file = join(backupDir(), `${PREFIX}${today()}${SUFFIX}`);
		const existing = listBackups();
		if (!existing.some((b) => join(backupDir(), b.name) === file)) {
			snapshot(file);
			console.log(`[backup] cópia criada: ${file}`);
		}
		for (const old of listBackups().slice(keep())) rmSync(join(backupDir(), old.name), { force: true });
	} catch (err) {
		console.error('[backup] falhou:', err);
	}
}

let timer;
/** Corre a cópia diária no arranque e depois de hora a hora (só cria uma por dia). */
export function startBackups() {
	if (timer) return;
	dailyBackup();
	timer = setInterval(dailyBackup, 3_600_000);
	timer.unref?.();
}

/** Cópia acabada de fazer, para descarregar. Devolve o caminho de um ficheiro temporário. */
export function freshCopy() {
	const file = join(tmpdir(), `marmita-download-${process.pid}-${Date.now()}.db`);
	snapshot(file);
	return file;
}
