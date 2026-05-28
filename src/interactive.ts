/* eslint-disable @typescript-eslint/no-var-requires */
const chalk = require('chalk');
import { select, input, confirm } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import { showBanner, showStep, showSuccess, showInfo, showWarning } from './ui';
import {
  runBridgeImportFromExternal,
  copyExternalAiInstructions,
} from './bridge-workflow';
import { runCompanionLoop } from './companion-session';
import { runInteractiveExport } from './export-flow';
import {
  segmentTranscript,
  suggestBestSegmentIndex,
  buildTranscriptFromSegment,
} from './transcript-utils';

let interactiveSessionActive = false;

/**
 * Menu principal — une seule boucle contrôlée, option Quitter explicite.
 */
export async function runInteractiveMode(): Promise<void> {
  if (interactiveSessionActive) {
    return;
  }
  interactiveSessionActive = true;

  try {
    showBanner();
    console.log(chalk.blue(`  📁  ${process.cwd()}\n`));
    console.log(chalk.gray('  Pont : IDE ↔ votre IA externe (export / import de fichiers)\n'));

    let running = true;
    while (running) {
      const mainAction = await select({
        message: 'Menu principal',
        choices: [
          {
            name: '1. Importer la réponse de mon IA → fichiers du projet',
            value: 'import',
          },
          {
            name: '2. Exporter mon projet → presse-papiers (pour mon IA)',
            value: 'export',
          },
          {
            name: '3. Session accompagnée (export + import + vérifications)',
            value: 'companion',
          },
          {
            name: '4. Copier le format de réponse pour mon IA',
            value: 'instructions',
          },
          {
            name: '5. Autres (tutoriel, discussion, diagnostic, aide)',
            value: 'more',
          },
          {
            name: '0. Quitter',
            value: 'quit',
          },
        ],
      });

      switch (mainAction) {
        case 'import':
          await runBridgeImportFromExternal({ showDiagram: false });
          break;
        case 'export':
          await runInteractiveExport({ bridgeMode: true, skipBanner: true });
          break;
        case 'companion':
          await runCompanionLoop();
          break;
        case 'instructions':
          copyExternalAiInstructions();
          break;
        case 'more':
          await runMoreMenu();
          break;
        case 'quit':
          running = false;
          console.log(chalk.blue('\n  Au revoir.\n'));
          break;
      }
    }
  } finally {
    interactiveSessionActive = false;
  }
}

async function runMoreMenu(): Promise<void> {
  const action = await select({
    message: 'Autres options',
    choices: [
      { name: 'Tutoriel (transcription vidéo)', value: 'tutoriel' },
      { name: 'Discussion IA (terminal)', value: 'chat' },
      { name: '🔴 Live Coding (Surveillance en temps réel)', value: 'watch' },
      { name: '🤖 Assistant IA (Débogage & suggestions)', value: 'assist' },
      { name: 'Diagnostic', value: 'doctor' },
      { name: 'Aide', value: 'help' },
      { name: '← Retour au menu principal', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'tutoriel') {
    await runInteractiveTutoriel();
  } else if (action === 'chat') {
    const { runLocalChatMode } = await import('./attitudes/chat-local');
    await runLocalChatMode();
  } else if (action === 'watch') {
    const { runWatchCommand } = await import('./commands/watch-cmd');
    await runWatchCommand(process.cwd());
  } else if (action === 'assist') {
    const { runAssistCommand } = await import('./commands/assist-cmd');
    await runAssistCommand(process.cwd());
  } else if (action === 'doctor') {
    const { runDoctor } = await import('./doctor');
    await runDoctor();
  } else if (action === 'help') {
    const { showHelp } = await import('./ui');
    showHelp();
  }
}

async function runInteractiveTutoriel(): Promise<void> {
  const source = await select({
    message: 'Transcription :',
    choices: [
      { name: 'Presse-papiers', value: 'clipboard' },
      { name: 'Fichier', value: 'file' },
    ],
  });

  let transcript = '';
  if (source === 'clipboard') {
    try {
      transcript = clipboardy.readSync();
      if (!transcript.trim()) {
        showWarning('Presse-papiers vide.');
        return;
      }
    } catch {
      showWarning('Presse-papiers inaccessible.');
      return;
    }
  } else {
    const p = await input({ message: 'Fichier :', default: 'transcript.txt' });
    const full = path.resolve(process.cwd(), p.trim());
    if (!fs.existsSync(full)) {
      showWarning('Fichier introuvable.');
      return;
    }
    transcript = fs.readFileSync(full, 'utf8');
  }

  showStep('📄', `${transcript.length.toLocaleString()} caractères`);

  const segments = segmentTranscript(transcript);
  let workingTranscript = transcript;

  if (segments.length > 1) {
    const suggested = suggestBestSegmentIndex(segments);
    const pickMode = await select({
      message: 'Transcription longue — par où commencer ?',
      choices: [
        { name: `Recommandé (partie ${suggested + 1})`, value: 'auto' },
        { name: 'Choisir une partie', value: 'manual' },
        { name: 'Tout (IA cloud conseillée)', value: 'full' },
      ],
    });

    if (pickMode === 'auto') {
      workingTranscript = buildTranscriptFromSegment(segments, suggested);
      showInfo(`Partie ${suggested + 1} : ${segments[suggested].title}`);
    } else if (pickMode === 'manual') {
      const chosen = await select({
        message: 'Partie :',
        choices: segments.map((s) => ({
          name: `[${s.index + 1}] ${s.title} (${s.charCount} car.)`,
          value: s.index,
        })),
      });
      workingTranscript = buildTranscriptFromSegment(segments, chosen);
    }
  }

  const tempPath = path.resolve(process.cwd(), '.temp-transcript-segment.txt');
  fs.writeFileSync(tempPath, workingTranscript, 'utf8');

  const { runTutorielAttitude } = await import('./attitudes/tutoriel');
  await runTutorielAttitude(tempPath);

  try {
    fs.unlinkSync(tempPath);
  } catch {}
}
