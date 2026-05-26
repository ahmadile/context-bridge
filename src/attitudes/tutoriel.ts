/**
 * attitudes/tutoriel.ts
 * 
 * Boucle de mentorat interactif "pas-à-pas".
 * Architecture à deux niveaux :
 *   1. Grande IA (OpenAI) en priorité
 *   2. IA Locale (Qwen via node-llama-cpp) en secours (fallback)
 */
import chalk from 'chalk';
import { select, input, confirm } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import { OpenAIEngine } from '../open-ai-engine';
import { AIEngine } from '../ai-engine';
import { scanDirectory, readFilesContent } from '../scanner';
import { extractSignatures, formatSignatures } from '../ast-parser';
import { loadSession, saveSession, Message } from '../session-manager';

// ─── Types ──────────────────────────────────────────────────────────

interface MentorEngine {
  chat(message: string): Promise<string>;
  name: string;
}

// ─── System Prompt ──────────────────────────────────────────────────

function buildSystemPrompt(transcript: string): string {
  return `Tu es un mentor expert en programmation. Tu accompagnes un développeur qui suit un tutoriel vidéo.

RÈGLES IMPORTANTES :
1. Tu dois guider l'utilisateur ÉTAPE PAR ÉTAPE à travers le tutoriel.
2. Ne donne JAMAIS tout le code d'un coup. Donne une seule étape à la fois.
3. Après chaque étape, attends que l'utilisateur te montre son code avant de continuer.
4. Si l'utilisateur fait une erreur, explique-lui POURQUOI c'est faux et guide-le vers la correction.
5. Sois encourageant et pédagogue. L'objectif est qu'il COMPRENNE, pas qu'il copie-colle.
6. Réponds TOUJOURS en français.

Voici la transcription complète du tutoriel :
---
${transcript}
---

Commence par résumer brièvement ce que le tutoriel va enseigner, puis donne la PREMIÈRE étape (un seul concept ou une seule action à faire). Termine toujours par une question pour vérifier que l'utilisateur a compris.`;
}

// ─── Engine Initialization ──────────────────────────────────────────

async function initMentorEngine(systemPrompt: string): Promise<MentorEngine> {
  // Try the Grande IA first (OpenAI)
  const openai = new OpenAIEngine();
  const openaiReady = await openai.init();

  if (openaiReady) {
    openai.setSystemPrompt(systemPrompt);
    console.log(chalk.green(`  ✓ Connecté à la Grande IA (OpenAI)`));
    return {
      name: 'OpenAI',
      chat: (msg: string) => openai.chat(msg),
    };
  }

  // Fallback to Local AI
  console.log(chalk.yellow(`  ⚠ Pas de clé OPENAI_API_KEY détectée.`));
  console.log(chalk.blue(`  → Basculement vers l'IA locale (Qwen2.5-Coder)...`));
  
  const localSession = await AIEngine.createSession(systemPrompt);
  console.log(chalk.green(`  ✓ IA locale prête`));
  return {
    name: 'Qwen (Local)',
    chat: (msg: string) => localSession.chat(msg),
  };
}

/**
 * Attempt to fallback to local AI mid-conversation.
 */
async function fallbackToLocal(systemPrompt: string, lastUserMessage: string): Promise<MentorEngine | null> {
  try {
    console.log(chalk.yellow(`\n  ⚠ La Grande IA n'est plus disponible (quota atteint ?)`));
    console.log(chalk.blue(`  → Basculement automatique vers l'IA locale...`));
    
    const localSession = await AIEngine.createSession(systemPrompt);
    // Re-send the last message so the user doesn't lose their turn
    console.log(chalk.gray(`  → Renvoi de votre dernière question à l'IA locale...`));
    return {
      name: 'Qwen (Local)',
      chat: (msg: string) => localSession.chat(msg),
    };
  } catch (e) {
    return null;
  }
}

// ─── Code Scanner ───────────────────────────────────────────────────

function scanCurrentCode(targetDir: string): string {
  try {
    const files = scanDirectory(targetDir, targetDir);
    const { contents } = readFilesContent(targetDir, files, false);

    // Build a summary with AST signatures for a compact view
    const parts: string[] = [];
    for (const [filePath, content] of Object.entries(contents)) {
      if (content.startsWith('//')) continue;
      const sigs = extractSignatures(content, filePath);
      if (sigs.length > 0) {
        parts.push(formatSignatures(sigs, filePath));
      }
    }

    if (parts.length === 0) {
      return '(Aucun fichier de code trouvé dans le répertoire courant)';
    }

    return parts.join('\n\n');
  } catch (e) {
    return '(Erreur lors du scan du code)';
  }
}

// ─── Main Interactive Loop ──────────────────────────────────────────

export async function runTutorielAttitude(transcriptPath: string) {
  console.log(chalk.blue.bold(`\n  🎓 Mode Mentorat Interactif\n`));
  console.log(chalk.gray(`  ─────────────────────────────────────────────────────────`));

  // 1. Load transcript
  if (!fs.existsSync(transcriptPath)) {
    console.error(chalk.red(`  ✗ Fichier introuvable : ${transcriptPath}`));
    return;
  }

  const transcript = fs.readFileSync(transcriptPath, 'utf-8');
  console.log(chalk.gray(`  📄 Transcription chargée (${transcript.length} caractères)`));

  // 2. Build system prompt
  const systemPrompt = buildSystemPrompt(transcript);

  // 3. Check for existing session
  let history: Message[] = [];
  const existingHistory = loadSession('tutoriel');
  let restored = false;

  if (existingHistory && existingHistory.length > 0) {
    const restore = await confirm({
      message: '⏳  Une session de mentorat précédente a été trouvée pour ce projet. Voulez-vous la restaurer ?',
      default: true
    });
    
    if (restore) {
      history = existingHistory;
      restored = true;
      console.log(chalk.gray('\n  ─── Restauration de la session de mentorat ───'));
      for (const msg of history) {
        if (msg.role === 'user') {
          const displayContent = msg.content.split('\n\nVoici mon code actuel')[0];
          console.log(`  ${chalk.blue('👤 Vous :')} ${displayContent}`);
        } else {
          console.log(`  ${chalk.green('🤖 Mentor :')} ${msg.content}`);
        }
        console.log(chalk.gray('  ───────────────────────────────────'));
      }
      console.log(chalk.gray('  ─── Fin de la restauration ───\n'));
    }
  }

  // 4. Initialize the mentor (Grande IA or Local)
  let engine: MentorEngine;
  try {
    engine = await initMentorEngine(systemPrompt);
  } catch (e: any) {
    console.error(chalk.red(`  ✗ Impossible d'initialiser l'IA : ${e.message}`));
    return;
  }

  console.log(chalk.gray(`  ─────────────────────────────────────────────────────────`));
  console.log(chalk.blue(`  🤖 Moteur actif : ${engine.name}`));
  console.log(chalk.gray(`  ─────────────────────────────────────────────────────────\n`));

  // Seed history context if restored
  if (restored && history.length > 0) {
    console.log(chalk.gray(`  ⚙️   Synchronisation du mentor...`));
    const historySeed = `Voici l'historique de notre session de mentorat précédente pour ton contexte :\n` +
      history.map(m => `${m.role === 'user' ? 'Développeur' : 'Mentor'}: ${m.content}`).join('\n') +
      `\n\nContinue de me guider pas-à-pas à partir de cet historique de conversation. Ne recommence pas le tutoriel depuis le début.`;
    
    try {
      await engine.chat(historySeed);
    } catch (e) {}
  }

  // 5. Get the first step from the mentor (or show last response)
  let response: string;
  if (!restored) {
    try {
      response = await engine.chat('Commence le tutoriel. Donne-moi la première étape.');
      history.push({ role: 'assistant', content: response });
      saveSession('tutoriel', history);
    } catch (e: any) {
      console.error(chalk.red(`  ✗ Erreur lors de la première requête : ${e.message}`));
      return;
    }

    console.log(chalk.green.bold(`\n  ═══ Mentor (${engine.name}) ═══\n`));
    console.log(`  ${response.split('\n').join('\n  ')}`);
    console.log(chalk.green.bold(`\n  ═════════════════════════════\n`));
  } else {
    response = history[history.length - 1].content;
    console.log(chalk.green.bold(`\n  ═══ Mentor (${engine.name}) [Restauré] ═══\n`));
    console.log(`  ${response.split('\n').join('\n  ')}`);
    console.log(chalk.green.bold(`\n  ═══════════════════════════════════════\n`));
  }

  // 6. Interactive loop
  const targetDir = process.cwd();

  while (true) {
    const action = await select({
      message: '🎯  Que voulez-vous faire ?',
      choices: [
        { name: '✅  J\'ai écrit le code → Vérifie-le !', value: 'verify' },
        { name: '❓  Je suis bloqué → Aide-moi', value: 'help' },
        { name: '⏭️   Passe à l\'étape suivante', value: 'next' },
        { name: '💬  Poser une question libre', value: 'question' },
        { name: '🔴  Quitter le mentorat', value: 'quit' },
      ],
    });

    if (action === 'quit') {
      console.log(chalk.blue(`\n  👋 Fin du mentorat. Session sauvegardée. Bon courage pour la suite !\n`));
      break;
    }

    let userMessage = '';

    if (action === 'verify') {
      console.log(chalk.gray(`  🔍 Scan de votre code en cours...`));
      const code = scanCurrentCode(targetDir);
      userMessage = `Voici mon code actuel. Vérifie s'il correspond à ce que le tutoriel demande pour cette étape :\n\n${code}`;
    } else if (action === 'help') {
      userMessage = `Je suis bloqué sur cette étape. Peux-tu me donner un indice supplémentaire sans me donner la réponse complète ?`;
    } else if (action === 'next') {
      userMessage = `J'ai compris cette étape. Donne-moi l'étape suivante du tutoriel.`;
    } else if (action === 'question') {
      const q = await input({ message: '💬  Votre question :' });
      userMessage = q;
    }

    // Save user message to history
    history.push({ role: 'user', content: userMessage });
    saveSession('tutoriel', history);

    // Send to the active engine
    try {
      response = await engine.chat(userMessage);
    } catch (e: any) {
      // If the Grande IA fails, try to fallback to local
      if (e.message === 'QUOTA_EXCEEDED') {
        const localEngine = await fallbackToLocal(systemPrompt, userMessage);
        if (localEngine) {
          engine = localEngine;
          // Retry with the local engine
          try {
            response = await engine.chat(userMessage);
          } catch (localErr: any) {
            console.error(chalk.red(`  ✗ L'IA locale a aussi échoué : ${localErr.message}`));
            continue;
          }
        } else {
          console.error(chalk.red(`  ✗ Impossible de basculer vers l'IA locale.`));
          break;
        }
      } else {
        console.error(chalk.red(`  ✗ Erreur : ${e.message}`));
        continue;
      }
    }

    // Save assistant response to history
    history.push({ role: 'assistant', content: response });
    saveSession('tutoriel', history);

    // Display the mentor's response
    console.log(chalk.green.bold(`\n  ═══ Mentor (${engine.name}) ═══\n`));
    console.log(`  ${response.split('\n').join('\n  ')}`);
    console.log(chalk.green.bold(`\n  ═════════════════════════════\n`));
  }
}
