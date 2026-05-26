/**
 * Pont IDE ↔ IA externe (ChatGPT, Claude, Gemini dans le navigateur).
 * Workflow : export contexte → discussion navigateur → import réponse → fichiers locaux.
 */
import chalk from 'chalk';
import { select, confirm, input } from '@inquirer/prompts';
import clipboardy from 'clipboardy';
import fs from 'fs';
import path from 'path';
import { showStep, showSuccess, showInfo, showWarning } from './ui';
import { parseAIResponse, generateDiff, applyCodeBlocks } from './importer';

/** Instructions à coller dans ChatGPT pour obtenir des réponses importables. */
export const CHATGPT_IMPORT_INSTRUCTION = `Quand tu proposes du code à appliquer dans mon projet, utilise TOUJOURS ce format pour chaque fichier :

\`\`\`typescript chemin/relatif/vers/fichier.ts
// contenu complet du fichier ou du correctif
\`\`\`

Remplace "typescript" par le langage réel et mets le chemin relatif depuis la racine du projet.
Un bloc = un fichier. Ne mélange pas plusieurs fichiers dans un seul bloc sans chemin.`;

export function printBridgeDiagram(): void {
  console.log(chalk.cyan.bold('\n  🌉  Pont IDE ↔ votre IA (ChatGPT, Claude, etc.)\n'));
  console.log(chalk.gray('  ┌─────────────┐         ┌──────────────────┐         ┌─────────────┐'));
  console.log(chalk.gray('  │  Votre IDE  │  (1)    │  code-caricature │  (2)    │  Navigateur │'));
  console.log(chalk.gray('  │  (Cursor…)  │ ──────► │  CLI (export)    │ ──────► │  ChatGPT    │'));
  console.log(chalk.gray('  └─────────────┘         └──────────────────┘         └─────────────┘'));
  console.log(chalk.gray('        ▲                          │                          │'));
  console.log(chalk.gray('        │                          │                          │'));
  console.log(chalk.gray('        │         (4) import       │         (3) copier       │'));
  console.log(chalk.gray('        └──────────────────────────┴──────────────────────────┘'));
  console.log(chalk.gray('              Fichiers corrigés automatiquement dans le projet\n'));
  console.log(chalk.white('  Étapes :'));
  console.log(chalk.gray('    1. Export : le CLI scanne votre projet et copie le contexte'));
  console.log(chalk.gray('    2. Collez dans ChatGPT + décrivez votre bug / design'));
  console.log(chalk.gray('    3. Copiez la réponse de ChatGPT (Ctrl+C)'));
  console.log(chalk.gray('    4. Import : le CLI écrit les fichiers dans votre IDE\n'));
}

/**
 * Applique une réponse IA (presse-papiers ou texte) dans le projet.
 */
export async function applyBridgeResponse(
  responseText: string,
  options: { dryRun?: boolean; autoConfirm?: boolean } = {}
): Promise<boolean> {
  const targetDir = process.cwd();
  const blocks = parseAIResponse(responseText);

  if (blocks.length === 0) {
    showWarning('Aucun bloc de code avec chemin de fichier détecté.');
    showInfo('Demandez à ChatGPT d\'utiliser ce format :');
    console.log(chalk.gray('  ```ts src/monFichier.ts'));
    console.log(chalk.gray('  // votre code'));
    console.log(chalk.gray('  ```'));
    showInfo('Ou copiez le texte d\'aide : option « Copier les instructions pour ChatGPT » du menu.');
    return false;
  }

  showSuccess(`${blocks.length} fichier(s) détecté(s) — le CLI va les mettre à jour dans votre projet :`);
  for (const block of blocks) {
    const fullPath = path.resolve(targetDir, block.filePath);
    const oldContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
    console.log(generateDiff(oldContent, block.content, block.filePath));
  }

  if (options.dryRun) {
    showInfo('Prévisualisation uniquement — aucun fichier modifié.');
    return true;
  }

  let apply = options.autoConfirm ?? false;
  if (!apply) {
    apply = await confirm({
      message: '✅  Appliquer ces modifications dans votre projet (IDE) ?',
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
  showInfo('Retournez dans votre IDE : les fichiers sont à jour.');
  return true;
}

/**
 * Menu guidé : recevoir la réponse ChatGPT et l'appliquer (cœur du pont).
 */
export async function runBridgeImportFromChatGPT(): Promise<void> {
  printBridgeDiagram();
  console.log(chalk.yellow.bold('  📥  Étape 4 — Importer la réponse de ChatGPT dans votre IDE\n'));

  const source = await select({
    message: 'Où se trouve la réponse de ChatGPT ?',
    choices: [
      { name: '📋  Presse-papiers (je viens de faire Ctrl+C sur ChatGPT)', value: 'clipboard' },
      { name: '📄  Fichier enregistré (reponse.txt, .md…)', value: 'file' },
    ],
  });

  let responseText = '';
  const targetDir = process.cwd();

  if (source === 'clipboard') {
    try {
      responseText = clipboardy.readSync();
      if (!responseText.trim()) {
        showWarning('Le presse-papiers est vide. Copiez d\'abord la réponse ChatGPT.');
        return;
      }
      showStep('📋', 'Réponse lue depuis le presse-papiers');
    } catch {
      showWarning('Impossible de lire le presse-papiers.');
      return;
    }
  } else {
    const filePath = await input({ message: 'Chemin du fichier :', default: 'reponse-chatgpt.txt' });
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

export function copyChatGPTInstructions(): void {
  try {
    clipboardy.writeSync(CHATGPT_IMPORT_INSTRUCTION);
    showSuccess('Instructions pour ChatGPT copiées dans le presse-papiers !');
    showInfo('Collez-les une fois dans votre conversation ChatGPT avant de demander des corrections.');
  } catch {
    showWarning('Presse-papiers inaccessible.');
    console.log(chalk.gray('\n' + CHATGPT_IMPORT_INSTRUCTION + '\n'));
  }
}
