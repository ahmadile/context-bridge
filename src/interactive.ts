/* eslint-disable @typescript-eslint/no-var-requires */
const chalk = require('chalk');
import { select, input, confirm, checkbox } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import { scanDirectory, generateTree, readFilesContent } from './scanner';
import { countTokens } from './tokenCounter';
import { formatContext, TargetModel, estimateCost, formatCostTable } from './formatter';
import { extractSignatures, formatSignatures } from './ast-parser';
import { buildDependencyGraph, formatDependencyGraph } from './dep-graph';
import clipboardy from 'clipboardy';
import { showBanner, showStep, showSuccess, showInfo, showWarning, showTokenCount } from './ui';
import {
  printBridgeDiagram,
  runBridgeImportFromExternal,
  copyExternalAiInstructions,
  EXTERNAL_AI_IMPORT_INSTRUCTION,
} from './bridge-workflow';
import { runCompanionLoop, recordExport } from './companion-session';
import {
  segmentTranscript,
  suggestBestSegmentIndex,
  buildTranscriptFromSegment,
} from './transcript-utils';

/**
 * Tableau de bord interactif — menu principal
 */
export async function runInteractiveMode(): Promise<void> {
  showBanner();
  console.log(chalk.blue(`  📁  Dossier de travail : ${chalk.bold(process.cwd())}\n`));

  printBridgeDiagram();

  const mainAction = await select({
    message: '🎯  Tableau de bord — Que voulez-vous faire ?',
    choices: [
      {
        name: '🤝  Session liée (compagnon export/import)',
        value: 'companion',
        description: 'Accompagne votre discussion IA : vérifie, alerte, bilan',
      },
      {
        name: '📥  Pont IA → IDE : appliquer la réponse dans les fichiers',
        value: 'bridge-import',
        description: 'Copiez la réponse de votre IA → le CLI met à jour le projet',
      },
      {
        name: '📤  Pont IDE → IA : envoyer le code (export)',
        value: 'bridge-export',
        description: 'Contexte du projet vers presse-papiers / fichier',
      },
      {
        name: '📋  Instructions format import (pour votre IA)',
        value: 'bridge-instructions',
      },
      {
        name: '🔁  Boucle guidée (export → IA → import)',
        value: 'bridge-loop',
      },
      { name: '──────────────', value: 'sep', disabled: true },
      {
        name: '🎓  Tutoriel vidéo (transcription découpée)',
        value: 'tutoriel',
        description: 'Choisir la partie de la transcription par où commencer',
      },
      {
        name: '💬  Discussion IA dans le terminal',
        value: 'chat',
        description: 'Questions courtes, aide code, secours hors-ligne',
      },
      {
        name: '🩺  Diagnostic (MCP, build, modèles)',
        value: 'doctor',
      },
      {
        name: '📖  Aide détaillée',
        value: 'help',
      },
    ],
  });

  switch (mainAction) {
    case 'companion':
      await runCompanionLoop();
      return;
    case 'bridge-import':
      await runBridgeImportFromExternal();
      return;
    case 'bridge-export':
      await runInteractiveExport({ bridgeMode: true });
      return;
    case 'bridge-instructions':
      copyExternalAiInstructions();
      return;
    case 'bridge-loop':
      await runBridgeFullLoop();
      return;
    case 'tutoriel':
      await runInteractiveTutoriel();
      return;
    case 'chat': {
      const { runLocalChatMode } = await import('./attitudes/chat-local');
      await runLocalChatMode();
      return;
    }
    case 'doctor': {
      const { runDoctor } = await import('./doctor');
      await runDoctor();
      return;
    }
    case 'help': {
      const { showHelp } = await import('./ui');
      showHelp();
      return;
    }
    default:
      return;
  }
}

/** Boucle complète pont IDE ↔ ChatGPT */
async function runBridgeFullLoop(): Promise<void> {
  printBridgeDiagram();
  console.log(chalk.cyan.bold('  🔁  Boucle guidée en 3 temps\n'));

  showStep('1/3', 'Export du contexte vers votre IA…');
  await runInteractiveExport({ bridgeMode: true, skipBanner: true });

  console.log(chalk.yellow('\n  ⏸  Pause : collez dans votre IA (navigateur ou app).'));
  console.log(chalk.gray('     • Ctrl+V le contexte, posez votre question'));
  console.log(chalk.gray('     • Copiez toute la réponse (Ctrl+C)\n'));

  const ready = await confirm({
    message: 'Avez-vous copié la réponse de votre IA ?',
    default: false,
  });

  if (!ready) {
    showInfo('Revenez via « Pont IA → IDE » ou « Session liée ».');
    return;
  }

  showStep('3/3', 'Import dans le projet…');
  await runBridgeImportFromExternal();
}

/** Export interactif */
export async function runInteractiveExport(options: {
  bridgeMode?: boolean;
  skipBanner?: boolean;
} = {}): Promise<void> {
  if (!options.skipBanner && options.bridgeMode) {
    console.log(chalk.cyan.bold('\n  📤  Étape 1 — Envoyer votre projet à votre IA\n'));
  }

  const addInstructions = options.bridgeMode
    ? await confirm({
        message: 'Inclure votre question + le format d\'import pour l\'IA ?',
        default: true,
      })
    : false;

  let issue: string | undefined;
  if (addInstructions) {
    issue = await input({
      message: '💬  Votre question (bug, design, etc.) :',
      default: 'Analyse ce projet et propose les corrections nécessaires.',
    });
    issue = issue + '\n\n---\n' + EXTERNAL_AI_IMPORT_INSTRUCTION;
  }

  const exportMode = await select({
    message: 'Type d\'export :',
    choices: [
      { name: '🏗️  Architecture (léger, recommandé)', value: 'architecture' },
      { name: '📋  Complet', value: 'full' },
      { name: '🔍  Fichiers récents ou extensions', value: 'filter' },
    ],
  });

  let includeExts: string[] = [];
  let sinceMs: number | undefined;

  if (exportMode === 'filter') {
    const filterType = await select({
      message: 'Filtrer comment ?',
      choices: [
        { name: 'Extensions (.ts, .js…)', value: 'ext' },
        { name: 'Modifiés récemment', value: 'date' },
      ],
    });
    if (filterType === 'ext') {
      const extsInput = await input({ message: 'Extensions :', default: '.ts,.tsx,.js' });
      includeExts = extsInput.split(',').map((e) => e.trim());
    } else {
      const hoursInput = await input({ message: 'Depuis combien d\'heures ?', default: '48' });
      sinceMs = Date.now() - parseFloat(hoursInput) * 60 * 60 * 1000;
    }
  }

  const wantFocus = await confirm({
    message: 'Mettre un fichier en évidence (ex. fichier avec l\'erreur) ?',
    default: false,
  });

  let focusFiles: string[] = [];
  if (wantFocus) {
    const targetDir = process.cwd();
    const allFiles = scanDirectory(targetDir, targetDir, undefined, {});
    if (allFiles.length > 0) {
      focusFiles = await checkbox({
        message: 'Fichier(s) focus :',
        choices: allFiles.slice(0, 40).map((f) => ({ name: f, value: f })),
      });
    }
  }

  const targetDir = process.cwd();
  showStep('🔍', `Scan : ${targetDir}`);
  const files = scanDirectory(targetDir, targetDir, undefined, { includeExts, sinceMs });
  showStep('📁', `${files.length} fichiers`);

  const { contents, securityReport } = readFilesContent(targetDir, files, true);
  if (securityReport.length > 0) {
    showStep('🔒', `${securityReport.length} élément(s) masqué(s)`);
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

  const tokens = countTokens(formatted);
  showTokenCount(tokens);

  try {
    clipboardy.writeSync(formatted);
    showSuccess('Contexte copié dans le presse-papiers !');
  } catch {
    const outPath = path.resolve(targetDir, 'code-caricature.txt');
    fs.writeFileSync(outPath, formatted, 'utf8');
    showSuccess(`Fichier créé : ${outPath}`);
  }

  if (options.bridgeMode) {
    recordExport(files.length);
    console.log(chalk.cyan('\n  ▶  Collez dans votre IA (Ctrl+V), puis revenez pour l\'import.\n'));
  }
}

/** Tutoriel avec découpage intelligent de la transcription */
async function runInteractiveTutoriel(): Promise<void> {
  const source = await select({
    message: 'Transcription du tutoriel :',
    choices: [
      { name: '📋  Presse-papiers', value: 'clipboard' },
      { name: '📁  Fichier local', value: 'file' },
    ],
  });

  let transcript = '';
  let tempPath = '';
  let isTemp = false;

  if (source === 'clipboard') {
    try {
      transcript = clipboardy.readSync();
      if (!transcript.trim()) {
        showWarning('Presse-papiers vide.');
        return;
      }
    } catch {
      showWarning('Impossible de lire le presse-papiers.');
      return;
    }
  } else {
    const p = await input({ message: 'Chemin du fichier :', default: 'transcript.txt' });
    const full = path.resolve(process.cwd(), p.trim());
    if (!fs.existsSync(full)) {
      showWarning('Fichier introuvable.');
      return;
    }
    transcript = fs.readFileSync(full, 'utf8');
  }

  showStep('📄', `Transcription : ${transcript.length.toLocaleString()} caractères`);

  const segments = segmentTranscript(transcript);
  let workingTranscript = transcript;

  if (segments.length > 1) {
    console.log(chalk.cyan(`\n  ✂️  Découpage en ${segments.length} partie(s) — choisissez par où commencer :\n`));
    const suggested = suggestBestSegmentIndex(segments);
    const pickMode = await select({
      message: 'Comment démarrer le tutoriel ?',
      choices: [
        {
          name: `🤖  Recommandé : partie ${suggested + 1} (la plus « actionnable »)`,
          value: 'auto',
        },
        { name: '📑  Choisir moi-même une partie', value: 'manual' },
        { name: '📜  Tout envoyer (risque de dépassement si IA locale)', value: 'full' },
      ],
    });

    if (pickMode === 'auto') {
      workingTranscript = buildTranscriptFromSegment(segments, suggested);
      showInfo(`Démarrage à la partie ${suggested + 1} : « ${segments[suggested].title} »`);
    } else if (pickMode === 'manual') {
      const chosen = await select({
        message: 'Partie de la transcription :',
        choices: segments.map((s) => ({
          name: `[${s.index + 1}/${segments.length}] ${s.title} (${s.charCount.toLocaleString()} car.)`,
          value: s.index,
        })),
      });
      workingTranscript = buildTranscriptFromSegment(segments, chosen);
    }
  }

  tempPath = path.resolve(process.cwd(), '.temp-transcript-segment.txt');
  fs.writeFileSync(tempPath, workingTranscript, 'utf8');
  isTemp = true;

  const { runTutorielAttitude } = await import('./attitudes/tutoriel');
  await runTutorielAttitude(tempPath);

  if (isTemp && fs.existsSync(tempPath)) {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}
