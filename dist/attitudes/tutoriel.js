"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTutorielAttitude = runTutorielAttitude;
/**
 * attitudes/tutoriel.ts
 *
 * Boucle de mentorat interactif "pas-à-pas".
 * Architecture à deux niveaux :
 *   1. Grande IA (OpenAI) en priorité
 *   2. IA Locale (Qwen via node-llama-cpp) en secours (fallback)
 */
const chalk_1 = __importDefault(require("chalk"));
const prompts_1 = require("@inquirer/prompts");
const fs_1 = __importDefault(require("fs"));
const open_ai_engine_1 = require("../open-ai-engine");
const ai_engine_1 = require("../ai-engine");
const scanner_1 = require("../scanner");
const ast_parser_1 = require("../ast-parser");
const session_manager_1 = require("../session-manager");
const transcript_utils_1 = require("../transcript-utils");
// ─── System Prompt ──────────────────────────────────────────────────
function buildSystemPrompt(transcript, forLocalAi) {
    const prepared = forLocalAi
        ? (0, transcript_utils_1.prepareTranscriptForLocal)(transcript)
        : { excerpt: transcript, truncated: false, fullLength: transcript.length };
    const truncationNote = prepared.truncated
        ? `\n7. La transcription a été raccourcie (${prepared.fullLength.toLocaleString()} car. au total) : base-toi sur l'extrait et demande des précisions si besoin.\n`
        : '';
    return `Tu es un mentor expert en programmation. Tu accompagnes un développeur qui suit un tutoriel vidéo.

RÈGLES IMPORTANTES :
1. Tu dois guider l'utilisateur ÉTAPE PAR ÉTAPE à travers le tutoriel.
2. Ne donne JAMAIS tout le code d'un coup. Donne une seule étape à la fois.
3. Après chaque étape, attends que l'utilisateur te montre son code avant de continuer.
4. Si l'utilisateur fait une erreur, explique-lui POURQUOI c'est faux et guide-le vers la correction.
5. Sois encourageant et pédagogue. L'objectif est qu'il COMPRENNE, pas qu'il copie-colle.
6. Réponds TOUJOURS en français. Réponds de façon directe et structurée (résumé court + étape + question).
${truncationNote}
Voici la transcription du tutoriel :
---
${prepared.excerpt}
---

Commence par résumer brièvement ce que le tutoriel va enseigner, puis donne la PREMIÈRE étape (un seul concept ou une seule action à faire). Termine toujours par une question pour vérifier que l'utilisateur a compris.`;
}
// ─── Engine Initialization ──────────────────────────────────────────
async function initMentorEngine(systemPrompt, systemPromptLocal) {
    // Try the Grande IA first (OpenAI)
    const openai = new open_ai_engine_1.OpenAIEngine();
    const openaiReady = await openai.init();
    if (openaiReady) {
        openai.setSystemPrompt(systemPrompt);
        console.log(chalk_1.default.green(`  ✓ Connecté à la Grande IA (OpenAI)`));
        return {
            name: 'OpenAI',
            chat: (msg) => openai.chat(msg),
        };
    }
    // Fallback to Local AI
    console.log(chalk_1.default.yellow(`  ⚠ Pas de clé OPENAI_API_KEY détectée.`));
    console.log(chalk_1.default.blue(`  → Basculement vers l'IA locale (Qwen2.5-Coder)...`));
    const localSession = await ai_engine_1.AIEngine.createSession(systemPromptLocal);
    console.log(chalk_1.default.green(`  ✓ IA locale prête`));
    return {
        name: 'Qwen (Local)',
        chat: (msg) => localSession.chat(msg),
    };
}
/**
 * Attempt to fallback to local AI mid-conversation.
 */
async function fallbackToLocal(systemPromptLocal) {
    try {
        console.log(chalk_1.default.yellow(`\n  ⚠ La Grande IA n'est plus disponible (quota atteint ?)`));
        console.log(chalk_1.default.blue(`  → Basculement automatique vers l'IA locale...`));
        const localSession = await ai_engine_1.AIEngine.createSession(systemPromptLocal);
        // Re-send the last message so the user doesn't lose their turn
        console.log(chalk_1.default.gray(`  → Renvoi de votre dernière question à l'IA locale...`));
        return {
            name: 'Qwen (Local)',
            chat: (msg) => localSession.chat(msg),
        };
    }
    catch (e) {
        return null;
    }
}
// ─── Code Scanner ───────────────────────────────────────────────────
function scanCurrentCode(targetDir) {
    try {
        const files = (0, scanner_1.scanDirectory)(targetDir, targetDir);
        const { contents } = (0, scanner_1.readFilesContent)(targetDir, files, false);
        // Build a summary with AST signatures for a compact view
        const parts = [];
        for (const [filePath, content] of Object.entries(contents)) {
            if (content.startsWith('//'))
                continue;
            const sigs = (0, ast_parser_1.extractSignatures)(content, filePath);
            if (sigs.length > 0) {
                parts.push((0, ast_parser_1.formatSignatures)(sigs, filePath));
            }
        }
        if (parts.length === 0) {
            return '(Aucun fichier de code trouvé dans le répertoire courant)';
        }
        return parts.join('\n\n');
    }
    catch (e) {
        return '(Erreur lors du scan du code)';
    }
}
// ─── Main Interactive Loop ──────────────────────────────────────────
async function runTutorielAttitude(transcriptPath) {
    console.log(chalk_1.default.blue.bold(`\n  🎓 Mode Mentorat Interactif\n`));
    console.log(chalk_1.default.gray(`  ─────────────────────────────────────────────────────────`));
    // 1. Load transcript
    if (!fs_1.default.existsSync(transcriptPath)) {
        console.error(chalk_1.default.red(`  ✗ Fichier introuvable : ${transcriptPath}`));
        return;
    }
    const transcript = fs_1.default.readFileSync(transcriptPath, 'utf-8');
    console.log(chalk_1.default.gray(`  📄 Transcription chargée (${transcript.length.toLocaleString()} caractères)`));
    if (transcript.length > transcript_utils_1.LOCAL_TRANSCRIPT_MAX_CHARS) {
        console.log(chalk_1.default.yellow(`  ⚠ Transcription longue : l'IA locale n'utilisera qu'un extrait (~${transcript_utils_1.LOCAL_TRANSCRIPT_MAX_CHARS.toLocaleString()} car.). OpenAI utilisera le texte complet.`));
    }
    // 2. Build system prompts (full for cloud, excerpt for local)
    const systemPromptCloud = buildSystemPrompt(transcript, false);
    const systemPromptLocal = buildSystemPrompt(transcript, true);
    // 3. Check for existing session
    let history = [];
    const existingHistory = (0, session_manager_1.loadSession)('tutoriel');
    let restored = false;
    if (existingHistory && existingHistory.length > 0) {
        const restore = await (0, prompts_1.confirm)({
            message: '⏳  Une session de mentorat précédente a été trouvée pour ce projet. Voulez-vous la restaurer ?',
            default: true
        });
        if (restore) {
            history = existingHistory;
            restored = true;
            console.log(chalk_1.default.gray('\n  ─── Restauration de la session de mentorat ───'));
            for (const msg of history) {
                if (msg.role === 'user') {
                    const displayContent = msg.content.split('\n\nVoici mon code actuel')[0];
                    console.log(`  ${chalk_1.default.blue('👤 Vous :')} ${displayContent}`);
                }
                else {
                    console.log(`  ${chalk_1.default.green('🤖 Mentor :')} ${msg.content}`);
                }
                console.log(chalk_1.default.gray('  ───────────────────────────────────'));
            }
            console.log(chalk_1.default.gray('  ─── Fin de la restauration ───\n'));
        }
    }
    // 4. Initialize the mentor (Grande IA or Local)
    let engine;
    try {
        engine = await initMentorEngine(systemPromptCloud, systemPromptLocal);
    }
    catch (e) {
        console.error(chalk_1.default.red(`  ✗ Impossible d'initialiser l'IA : ${e.message}`));
        return;
    }
    console.log(chalk_1.default.gray(`  ─────────────────────────────────────────────────────────`));
    console.log(chalk_1.default.blue(`  🤖 Moteur actif : ${engine.name}`));
    console.log(chalk_1.default.gray(`  ─────────────────────────────────────────────────────────\n`));
    // Seed history context if restored
    if (restored && history.length > 0) {
        console.log(chalk_1.default.gray(`  ⚙️   Synchronisation du mentor...`));
        const historySeed = `Voici l'historique de notre session de mentorat précédente pour ton contexte :\n` +
            (0, transcript_utils_1.compactHistoryForLocal)(history) +
            `\n\nContinue de me guider pas-à-pas à partir de cet historique de conversation. Ne recommence pas le tutoriel depuis le début.`;
        try {
            await engine.chat(historySeed);
        }
        catch (e) { }
    }
    // 5. Get the first step from the mentor (or show last response)
    let response;
    if (!restored) {
        try {
            response = await engine.chat('Commence le tutoriel. Donne-moi la première étape.');
            history.push({ role: 'assistant', content: response });
            (0, session_manager_1.saveSession)('tutoriel', history);
        }
        catch (e) {
            console.error(chalk_1.default.red(`  ✗ Erreur lors de la première requête : ${e.message}`));
            return;
        }
        console.log(chalk_1.default.green.bold(`\n  ═══ Mentor (${engine.name}) ═══\n`));
        console.log(`  ${response.split('\n').join('\n  ')}`);
        console.log(chalk_1.default.green.bold(`\n  ═════════════════════════════\n`));
    }
    else {
        response = history[history.length - 1].content;
        console.log(chalk_1.default.green.bold(`\n  ═══ Mentor (${engine.name}) [Restauré] ═══\n`));
        console.log(`  ${response.split('\n').join('\n  ')}`);
        console.log(chalk_1.default.green.bold(`\n  ═══════════════════════════════════════\n`));
    }
    // 6. Interactive loop
    const targetDir = process.cwd();
    while (true) {
        const action = await (0, prompts_1.select)({
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
            console.log(chalk_1.default.blue(`\n  👋 Fin du mentorat. Session sauvegardée. Bon courage pour la suite !\n`));
            break;
        }
        let userMessage = '';
        if (action === 'verify') {
            console.log(chalk_1.default.gray(`  🔍 Scan de votre code en cours...`));
            const code = scanCurrentCode(targetDir);
            userMessage = `Voici mon code actuel. Vérifie s'il correspond à ce que le tutoriel demande pour cette étape :\n\n${code}`;
        }
        else if (action === 'help') {
            userMessage = `Je suis bloqué sur cette étape. Peux-tu me donner un indice supplémentaire sans me donner la réponse complète ?`;
        }
        else if (action === 'next') {
            userMessage = `J'ai compris cette étape. Donne-moi l'étape suivante du tutoriel.`;
        }
        else if (action === 'question') {
            const q = await (0, prompts_1.input)({ message: '💬  Votre question :' });
            userMessage = q;
            if (engine.name.includes('Local') || engine.name.includes('Qwen')) {
                const excerpt = (0, transcript_utils_1.findTranscriptExcerpt)(transcript, q);
                if (excerpt) {
                    userMessage += `\n\n[Extrait pertinent de la transcription]:\n---\n${excerpt}\n---`;
                }
            }
        }
        // Save user message to history
        history.push({ role: 'user', content: userMessage });
        (0, session_manager_1.saveSession)('tutoriel', history);
        // Send to the active engine
        try {
            response = await engine.chat(userMessage);
        }
        catch (e) {
            // If the Grande IA fails, try to fallback to local
            if (e.message === 'QUOTA_EXCEEDED') {
                const localEngine = await fallbackToLocal(systemPromptLocal);
                if (localEngine) {
                    engine = localEngine;
                    // Retry with the local engine
                    try {
                        response = await engine.chat(userMessage);
                    }
                    catch (localErr) {
                        console.error(chalk_1.default.red(`  ✗ L'IA locale a aussi échoué : ${localErr.message}`));
                        continue;
                    }
                }
                else {
                    console.error(chalk_1.default.red(`  ✗ Impossible de basculer vers l'IA locale.`));
                    break;
                }
            }
            else {
                console.error(chalk_1.default.red(`  ✗ Erreur : ${e.message}`));
                continue;
            }
        }
        // Save assistant response to history
        history.push({ role: 'assistant', content: response });
        (0, session_manager_1.saveSession)('tutoriel', history);
        if (!response || !response.trim()) {
            console.log(chalk_1.default.yellow(`\n  ⚠ Le mentor n'a pas renvoyé de texte (réponse vide). Réessayez ou utilisez OPENAI_API_KEY.\n`));
            continue;
        }
        // Display the mentor's response
        console.log(chalk_1.default.green.bold(`\n  ═══ Mentor (${engine.name}) ═══\n`));
        console.log(`  ${response.split('\n').join('\n  ')}`);
        console.log(chalk_1.default.green.bold(`\n  ═════════════════════════════\n`));
    }
}
