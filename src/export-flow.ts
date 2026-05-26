/**
 * Export interactif du contexte projet (évite import circulaire avec interactive / companion).
 */
import chalk from 'chalk';
import { select, input, confirm, checkbox } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import { scanDirectory, generateTree, readFilesContent } from './scanner';
import { countTokens } from './tokenCounter';
import { formatContext } from './formatter';
import { extractSignatures, formatSignatures } from './ast-parser';
import { showStep, showSuccess, showWarning, showTokenCount } from './ui';
import { EXTERNAL_AI_IMPORT_INSTRUCTION } from './bridge-workflow';
import { recordExport } from './companion-session';

export async function runInteractiveExport(options: {
  bridgeMode?: boolean;
  skipBanner?: boolean;
} = {}): Promise<void> {
  if (!options.skipBanner && options.bridgeMode) {
    console.log(chalk.cyan.bold('\n  📤  Export — envoyer le projet à votre IA\n'));
  }

  const addInstructions = options.bridgeMode
    ? await confirm({
        message: 'Ajouter votre question + le format pour l\'import ?',
        default: true,
      })
    : false;

  let issue: string | undefined;
  if (addInstructions) {
    const q = await input({
      message: 'Votre question :',
      default: 'Analyse ce projet et propose les corrections.',
    });
    issue = `${q}\n\n---\n${EXTERNAL_AI_IMPORT_INSTRUCTION}`;
  }

  const exportMode = await select({
    message: 'Type d\'export :',
    choices: [
      { name: 'Architecture (léger)', value: 'architecture' },
      { name: 'Complet', value: 'full' },
      { name: 'Fichiers récents / extensions', value: 'filter' },
    ],
  });

  let includeExts: string[] = [];
  let sinceMs: number | undefined;

  if (exportMode === 'filter') {
    const filterType = await select({
      message: 'Filtre :',
      choices: [
        { name: 'Extensions', value: 'ext' },
        { name: 'Modifiés récemment', value: 'date' },
      ],
    });
    if (filterType === 'ext') {
      const extsInput = await input({ message: 'Extensions :', default: '.ts,.tsx,.js' });
      includeExts = extsInput.split(',').map((e) => e.trim());
    } else {
      const hoursInput = await input({ message: 'Depuis (heures) :', default: '48' });
      sinceMs = Date.now() - parseFloat(hoursInput) * 60 * 60 * 1000;
    }
  }

  let focusFiles: string[] = [];
  if (await confirm({ message: 'Fichier(s) en focus ?', default: false })) {
    const targetDir = process.cwd();
    const allFiles = scanDirectory(targetDir, targetDir, undefined, {});
    if (allFiles.length > 0) {
      focusFiles = await checkbox({
        message: 'Fichiers :',
        choices: allFiles.slice(0, 30).map((f) => ({ name: f, value: f })),
      });
    }
  }

  const targetDir = process.cwd();
  showStep('🔍', `Scan : ${targetDir}`);
  const files = scanDirectory(targetDir, targetDir, undefined, { includeExts, sinceMs });
  showStep('📁', `${files.length} fichiers`);

  const { contents, securityReport } = readFilesContent(targetDir, files, true);
  if (securityReport.length > 0) {
    showStep('🔒', `${securityReport.length} masqué(s)`);
  }

  const tree = generateTree(files);
  let architectureContents: { [key: string]: string } | undefined;
  if (exportMode === 'architecture') {
    architectureContents = {};
    for (const [filePath, content] of Object.entries(contents)) {
      if (!content.startsWith('//')) {
        architectureContents[filePath] = formatSignatures(
          extractSignatures(content, filePath),
          filePath
        );
      }
    }
  }

  const formatted = formatContext({
    tree,
    contents,
    target: 'gpt',
    issue,
    focus: focusFiles,
    architectureMode: exportMode === 'architecture',
    architectureContents,
  });

  showTokenCount(countTokens(formatted));

  try {
    clipboardy.writeSync(formatted);
    showSuccess('Copié dans le presse-papiers.');
  } catch {
    const outPath = path.resolve(targetDir, 'code-caricature.txt');
    fs.writeFileSync(outPath, formatted, 'utf8');
    showSuccess(`Fichier : ${outPath}`);
  }

  if (options.bridgeMode) {
    recordExport(files.length);
    console.log(chalk.cyan('\n  ▶  Collez dans votre IA, puis : menu « Importer réponse IA ».\n'));
  }
}
