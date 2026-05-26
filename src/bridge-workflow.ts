/**
 * Pont IDE ↔ IA externe (navigateur ou autre client).
 * Export/import de fichiers : sans IA. L'IA du CLI intervient ailleurs (compagnon, chat).
 */
import chalk from 'chalk';
import { select, confirm, input } from '@inquirer/prompts';
import clipboardy from 'clipboardy';
import fs from 'fs';
import path from 'path';
import { showStep, showSuccess, showInfo, showWarning } from './ui';
import { parseAIResponse, generateDiff, applyCodeBlocks } from './importer';
import { validateImportPreview, recordImport, loadLinkedSession } from './companion-session';

/** Instructions à coller dans votre IA externe pour des réponses importables. */
export const EXTERNAL_AI_IMPORT_INSTRUCTION = `Quand tu proposes du code à appliquer dans mon projet, utilise TOUJOURS ce format pour chaque fichier :

\`\`\`typescript chemin/relatif/vers/fichier.ts
// contenu complet du fichier ou du correctif
\`\`\`

Remplace "typescript" par le langage réel et mets le chemin relatif depuis la racine du projet.
Un bloc = un fichier. Ne mélange pas plusieurs fichiers dans un seul bloc sans chemin.`;

/** @deprecated Alias */
export const CHATGPT_IMPORT_INSTRUCTION = EXTERNAL_AI_IMPORT_INSTRUCTION;

export function printBridgeDiagram(): void {
  console.log(chalk.cyan.bold('\n  🌉  Pont IDE ↔ votre IA externe\n'));
  console.log(chalk.gray('  ┌─────────────┐         ┌──────────────────┐         ┌─────────────┐'));
  console.log(chalk.gray('  │  Votre IDE  │  (1)    │  code-caricature │  (2)    │  IA externe │'));
  console.log(chalk.gray('  │             │ ──────► │  CLI (export)    │ ──────► │ (navigateur)│'));
  console.log(chalk.gray('  └─────────────┘         └──────────────────┘         └─────────────┘'));
  console.log(chalk.gray('        ▲                          │                          │'));
  console.log(chalk.gray('        │         (4) import       │         (3) copier       │'));
  console.log(chalk.gray('        └──────────────────────────┴──────────────────────────┘'));
  console.log(chalk.gray('              Fichiers mis à jour dans le projet\n'));
  console.log(chalk.white('  Étapes :'));
  console.log(chalk.gray('    1. Export : scan du projet → presse-papiers'));
  console.log(chalk.gray('    2. Collez dans votre IA + décrivez votre besoin'));
  console.log(chalk.gray('    3. Copiez la réponse (Ctrl+C)'));
  console.log(chalk.gray('    4. Import : le CLI écrit les fichiers\n'));
}

export async function applyBridgeResponse(
  responseText: string,
  options: { dryRun?: boolean; autoConfirm?: boolean } = {}
): Promise<boolean> {
  const targetDir = process.cwd();
  const preview = validateImportPreview(responseText);
  if (loadLinkedSession() && preview.warnings.length > 0) {
    console.log(chalk.yellow('\n  🤝  Compagnon (session liée) — alertes :\n'));
    for (const w of preview.warnings) showWarning(w);
  }

  const blocks = parseAIResponse(responseText);

  if (blocks.length === 0) {
    showWarning('Aucun bloc de code avec chemin de fichier détecté.');
    showInfo('Demandez à votre IA d\'utiliser ce format :');
    console.log(chalk.gray('  ```ts src/monFichier.ts'));
    console.log(chalk.gray('  // votre code'));
    console.log(chalk.gray('  ```'));
    showInfo('Menu : « Copier les instructions pour l\'IA externe ».');
    return false;
  }

  showSuccess(`${blocks.length} fichier(s) détecté(s) :`);
  for (const block of blocks) {
    const fullPath = path.resolve(targetDir, block.filePath);
    const oldContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
    console.log(generateDiff(oldContent, block.content, block.filePath));
  }

  if (options.dryRun) {
    showInfo('Prévisualisation — aucun fichier modifié.');
    return true;
  }

  let apply = options.autoConfirm ?? false;
  if (!apply) {
    apply = await confirm({
      message: '✅  Appliquer ces modifications dans votre projet ?',
      default: true,
    });
  }

  if (!apply) {
    showInfo('Import annulé.');
    return false;
  }

  showStep('⚙️', 'Écriture des fichiers…');
  const result = applyCodeBlocks(targetDir, blocks);
  if (result.applied.length > 0) {
    showSuccess(`${result.applied.length} fichier(s) mis à jour :`);
    for (const f of result.applied) console.log(chalk.green(`     ✏️  ${f}`));
  }
  if (result.created.length > 0) {
    showSuccess(`${result.created.length} fichier(s) créé(s) :`);
    for (const f of result.created) console.log(chalk.green(`     🆕  ${f}`));
  }
  if (result.errors.length > 0) {
    showWarning(`${result.errors.length} erreur(s) :`);
    for (const e of result.errors) console.log(chalk.red(`     ❌  ${e}`));
  }

  recordImport(result.applied, result.created, result.errors);
  showInfo('Retournez dans votre IDE : les fichiers sont à jour.');
  return true;
}

export async function runBridgeImportFromExternal(): Promise<void> {
  printBridgeDiagram();
  console.log(chalk.yellow.bold('  📥  Importer la réponse de votre IA dans le projet\n'));

  const source = await select({
    message: 'Source de la réponse ?',
    choices: [
      { name: '📋  Presse-papiers (Ctrl+C)', value: 'clipboard' },
      { name: '📄  Fichier local', value: 'file' },
    ],
  });

  let responseText = '';
  const targetDir = process.cwd();

  if (source === 'clipboard') {
    try {
      responseText = clipboardy.readSync();
      if (!responseText.trim()) {
        showWarning('Presse-papiers vide.');
        return;
      }
      showStep('📋', 'Lecture du presse-papiers');
    } catch {
      showWarning('Impossible de lire le presse-papiers.');
      return;
    }
  } else {
    const filePath = await input({ message: 'Chemin du fichier :', default: 'reponse-ia.txt' });
    const full = path.resolve(targetDir, filePath.trim());
    if (!fs.existsSync(full)) {
      showWarning(`Fichier introuvable : ${full}`);
      return;
    }
    responseText = fs.readFileSync(full, 'utf8');
    showStep('📄', `Lecture : ${full}`);
  }

  await applyBridgeResponse(responseText);
}

/** @deprecated */
export const runBridgeImportFromChatGPT = runBridgeImportFromExternal;

export function copyExternalAiInstructions(): void {
  try {
    clipboardy.writeSync(EXTERNAL_AI_IMPORT_INSTRUCTION);
    showSuccess('Instructions copiées — collez-les une fois dans votre conversation IA.');
  } catch {
    showWarning('Presse-papiers inaccessible.');
    console.log(chalk.gray('\n' + EXTERNAL_AI_IMPORT_INSTRUCTION + '\n'));
  }
}

/** @deprecated */
export const copyChatGPTInstructions = copyExternalAiInstructions;
