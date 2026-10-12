import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Base de dados nova e vazia para cada ficheiro de testes.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'marmita-test-'));
process.env.BACKUP_KEEP ??= '3';
