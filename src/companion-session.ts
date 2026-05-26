/**
 * Session liée : accompagne export/import pendant une discussion avec une IA externe.
 * L'IA du CLI intervient surtout en cas d'erreur ou de doute (pas pour remplacer l'import).
 */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { select, confirm } from '@inquirer/prompts';
import { showStep, showSuccess, showInfo, showWarning } from './ui';
import { parseAIResponse } from './importer';

const sessionRoot = path.join(os.homedir(), '.code-caricature', 'sessions');

export interface LinkedSession {
  cwd: string;
  startedAt: string;
  active: boolean;
  lastAction?: 'export' | 'import';
  lastActionAt?: string;
  lastExportFiles?: number;
  lastImportFiles?: string[];
  lastImportErrors?: string[];
  notes?: string;
}

function sessionPath(): string {
  const hash = crypto.createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16);
  return path.join(sessionRoot, `linked-${hash}.json`);
}

export function loadLinkedSession(): LinkedSession | null {
  try {
    const p = sessionPath();
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as LinkedSession;
    if (data.cwd !== process.cwd() || !data.active) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveLinkedSession(data: LinkedSession): void {
  fs.mkdirSync(sessionRoot, { recursive: true });
  fs.writeFileSync(sessionPath(), JSON.stringify(data, null, 2), 'utf8');
}

export function startLinkedSession(): LinkedSession {
  const session: LinkedSession = {
    cwd: process.cwd(),
    startedAt: new Date().toISOString(),
    active: true,
  };
  saveLinkedSession(session);
  return session;
}

export function endLinkedSession(): void {
  const s = loadLinkedSession();
  if (s) {
    s.active = false;
    saveLinkedSession(s);
  }
}

export function recordExport(fileCount: number): void {
  const s = loadLinkedSession() || startLinkedSession();
  s.lastAction = 'export';
  s.lastActionAt = new Date().toISOString();
  s.lastExportFiles = fileCount;
  saveLinkedSession(s);
}

export function recordImport(applied: string[], created: string[], errors: string[]): void {
  const s = loadLinkedSession() || startLinkedSession();
  s.lastAction = 'import';
  s.lastActionAt = new Date().toISOString();
  s.lastImportFiles = [...applied, ...created];
  s.lastImportErrors = errors;
  saveLinkedSession(s);
}

/** Vérifie une réponse IA avant application (chemins, blocs). */
export function validateImportPreview(responseText: string): {
  ok: boolean;
  blockCount: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const blocks = parseAIResponse(responseText);
  const cwd = process.cwd();

  if (blocks.length === 0) {
    warnings.push('Aucun bloc ```lang chemin/fichier``` détecté — l\'import échouera probablement.');
    return { ok: false, blockCount: 0, warnings };
  }

  for (const b of blocks) {
    const resolved = path.resolve(cwd, b.filePath);
    if (!resolved.startsWith(cwd)) {
      warnings.push(`Chemin suspect (hors projet) : ${b.filePath}`);
    }
    if (b.filePath.includes('..')) {
      warnings.push(`Chemin avec ".." : ${b.filePath}`);
    }
  }

  return { ok: warnings.length === 0, blockCount: blocks.length, warnings };
}

export async function runCompanionLoop(): Promise<void> {
  let session = loadLinkedSession();
  if (!session) {
    const start = await confirm({
      message: 'Démarrer une session liée pour cette discussion avec votre IA externe ?',
      default: true,
    });
    if (!start) return;
    session = startLinkedSession();
  }

  console.log(chalk.cyan.bold('\n  🤝  Session liée — compagnon CLI\n'));
  console.log(chalk.gray(`  Projet : ${session.cwd}`));
  console.log(chalk.gray(`  Depuis : ${new Date(session.startedAt).toLocaleString()}\n`));
  console.log(chalk.white('  Rôle du compagnon :'));
  console.log(chalk.gray('    • Export/import : automatiques (sans IA)'));
  console.log(chalk.gray('    • Compagnon : vérifie, signale les erreurs, propose de l\'aide\n'));

  while (true) {
    const action = await select({
      message: 'Session liée — action ?',
      choices: [
        { name: '📤  Export vers mon IA (navigateur)', value: 'export' },
        { name: '📥  Import depuis mon IA (presse-papiers)', value: 'import' },
        { name: '🔍  Vérifier une réponse avant import', value: 'validate' },
        { name: '📊  Bilan de la session', value: 'status' },
        { name: '🔴  Terminer la session liée', value: 'end' },
      ],
    });

    if (action === 'end') {
      endLinkedSession();
      showInfo('Session liée terminée.');
      return;
    }

    if (action === 'status') {
      const s = loadLinkedSession();
      if (!s) {
        showWarning('Aucune session active.');
        continue;
      }
      console.log(chalk.gray(`\n  Dernière action : ${s.lastAction || '—'} (${s.lastActionAt || '—'})`));
      if (s.lastExportFiles != null) console.log(chalk.gray(`  Fichiers scannés (export) : ${s.lastExportFiles}`));
      if (s.lastImportFiles?.length) console.log(chalk.gray(`  Fichiers touchés (import) : ${s.lastImportFiles.join(', ')}`));
      if (s.lastImportErrors?.length) {
        console.log(chalk.red(`  Erreurs : ${s.lastImportErrors.join('; ')}`));
      }
      console.log('');
      continue;
    }

    if (action === 'validate') {
      const clipboardy = (await import('clipboardy')).default;
      let text = '';
      try {
        text = clipboardy.readSync();
      } catch {
        showWarning('Presse-papiers inaccessible.');
        continue;
      }
      const v = validateImportPreview(text);
      if (v.blockCount > 0) showSuccess(`${v.blockCount} fichier(s) détecté(s).`);
      for (const w of v.warnings) showWarning(w);
      if (v.ok && v.blockCount > 0) showInfo('Vous pouvez lancer l\'import en toute confiance.');
      continue;
    }

    if (action === 'export') {
      const { runInteractiveExport } = await import('./export-flow');
      await runInteractiveExport({ bridgeMode: true, skipBanner: true });
      showInfo('Collez le contenu dans votre IA externe.');
      continue;
    }

    if (action === 'import') {
      const { runBridgeImportFromExternal } = await import('./bridge-workflow');
      await runBridgeImportFromExternal({ showDiagram: false });
      continue;
    }
  }
}
