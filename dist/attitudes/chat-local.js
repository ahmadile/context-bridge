"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLocalChatMode = runLocalChatMode;
/**
 * attitudes/chat-local.ts
 *
 * Mode discussion (chat) avec l'IA locale (Qwen2.5-Coder).
 * Permet de lui poser des questions, d'analyser la structure ou des fichiers spécifiques.
 * Supporte le référencement de fichiers avec '@' et l'exécution de commandes CLI avec '$'.
 * Intègre la persistance des sessions et la restauration d'historique.
 */
const chalk_1 = __importDefault(require("chalk"));
const prompts_1 = require("@inquirer/prompts");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const ai_engine_1 = require("../ai-engine");
const open_ai_engine_1 = require("../open-ai-engine");
const scanner_1 = require("../scanner");
const session_manager_1 = require("../session-manager");
const transcript_utils_1 = require("../transcript-utils");
const MAX_FILE_INJECT_CHARS = 12_000;
const MAX_TOTAL_ATTACH_CHARS = 24_000;
/**
 * Executes a CLI command internally using child_process.execSync
 */
function executeCLICommand(cmdStr) {
    // Remove the leading '$' and trim
    const cleanCmd = cmdStr.replace(/^\$/, '').trim();
    if (!cleanCmd) {
        return 'Erreur : Commande vide.';
    }
    // Split to get the command (first word)
    const parts = cleanCmd.split(/\s+/);
    const cmd = parts[0];
    const allowedCommands = ['export', 'import', 'help'];
    if (!allowedCommands.includes(cmd)) {
        return `Erreur : La commande "$${cmd}" n'est pas autorisée. Commandes autorisées : $export, $import, $help.`;
    }
    const indexJsPath = path_1.default.resolve(__dirname, '../index.js');
    try {
        const output = (0, child_process_1.execSync)(`node "${indexJsPath}" ${cleanCmd}`, {
            encoding: 'utf8',
            cwd: process.cwd()
        });
        return output;
    }
    catch (err) {
        return `Erreur lors de l'exécution de la commande CLI :\n${err.stdout || err.message}`;
    }
}
async function runLocalChatMode() {
    console.log(chalk_1.default.blue.bold(`\n  💬 Discussion Interactive avec l'IA Locale (Qwen2.5-Coder)\n`));
    console.log(chalk_1.default.blue(`  📁  Dossier cible : ${chalk_1.default.bold(process.cwd())}`));
    const targetDir = process.cwd();
    // 1. Check for existing session
    let history = [];
    const existingHistory = (0, session_manager_1.loadSession)('chat');
    if (existingHistory && existingHistory.length > 0) {
        const restore = await (0, prompts_1.confirm)({
            message: '⏳  Une discussion précédente a été trouvée pour ce projet. Voulez-vous la restaurer ?',
            default: true
        });
        if (restore) {
            history = existingHistory;
            console.log(chalk_1.default.gray('\n  ─── Restauration de l\'historique ───'));
            for (const msg of history) {
                if (msg.role === 'user') {
                    // Hide internal technical details (like @file injections) for a cleaner UI
                    const displayContent = msg.content.split('\n\n[Contenu du fichier')[0];
                    console.log(`  ${chalk_1.default.blue('👤 Vous :')} ${displayContent}`);
                }
                else {
                    console.log(`  ${chalk_1.default.green('🤖 IA :')} ${msg.content}`);
                }
                console.log(chalk_1.default.gray('  ───────────────────────────────────'));
            }
            console.log(chalk_1.default.gray('  ─── Fin de la restauration ───\n'));
        }
    }
    console.log(chalk_1.default.gray(`  ⚙️   Initialisation du modèle local en cours...`));
    // 2. Scan directory structure to give context
    let projectTreeText = '';
    try {
        const files = (0, scanner_1.scanDirectory)(targetDir, targetDir, undefined, {});
        projectTreeText = files.slice(0, 50).join('\n');
        if (files.length > 50) {
            projectTreeText += `\n... et ${files.length - 50} autres fichiers.`;
        }
    }
    catch (e) {
        projectTreeText = '(Impossible de scanner l\'arborescence)';
    }
    const systemPrompt = `Tu es un assistant de programmation expert intégré dans le CLI "code-caricature".
Tu es le relais entre l'utilisateur, son IDE et son IA externe (navigateur ou autre service).
Tu réponds TOUJOURS en français, de façon directe et utile (pas de réponse vide).
Si tu ne sais pas, dis-le clairement et propose une action concrète (ex: exporter le contexte, lire un fichier @).
Tu as accès à l'arborescence du projet actuel de l'utilisateur.

Voici la liste des fichiers du projet de l'utilisateur :
---
${projectTreeText}
---

Tu as également la capacité d'appeler les outils du CLI "code-caricature" pour aider l'utilisateur !
Pour appeler un outil, écris simplement une ligne commençant par "$" suivie de la commande (sans "code-caricature" ni "node dist/index.js").
Voici les commandes CLI disponibles :
1. $export - Exporte la caricature/contexte du projet (ex: "$export --output caricature.txt").
2. $import - Importe du code depuis le presse-papiers ou un fichier (ex: "$import --file reponse.md").
3. $help - Affiche l'aide complète du CLI.

Exemple : Si l'utilisateur te demande d'exporter le projet, tu peux lui répondre :
"Je vais exporter le contexte du projet dans un fichier context.txt.
$export --output context.txt"

Le système exécutera la commande et te transmettra son résultat automatiquement.`;
    let engine;
    const openai = new open_ai_engine_1.OpenAIEngine();
    const openaiReady = await openai.init();
    if (openaiReady) {
        openai.setSystemPrompt(systemPrompt);
        engine = { name: 'OpenAI (Grande IA)', chat: (m) => openai.chat(m) };
        console.log(chalk_1.default.green(`\n  ✓ Connecté à la Grande IA (OpenAI)`));
    }
    else {
        try {
            const localSession = await ai_engine_1.AIEngine.createSession(systemPrompt);
            engine = { name: 'Qwen (Local)', chat: (m) => localSession.chat(m) };
            console.log(chalk_1.default.green(`\n  ✓ IA locale prête (Qwen2.5-Coder)`));
            console.log(chalk_1.default.yellow(`  💡 Définissez OPENAI_API_KEY pour de meilleures réponses.`));
        }
        catch (e) {
            console.error(chalk_1.default.red(`\n  ✗ Impossible d'initialiser l'IA : ${e.message}`));
            return;
        }
    }
    if (history.length > 0) {
        console.log(chalk_1.default.gray(`  ⚙️   Synchronisation de l'historique...`));
        const historySeed = `Historique récent :\n${(0, transcript_utils_1.compactHistoryForLocal)(history)}\n\nContinue la discussion.`;
        try {
            await engine.chat(historySeed);
        }
        catch (e) { }
    }
    console.log(chalk_1.default.green(`  Moteur actif : ${engine.name}`));
    console.log(chalk_1.default.gray(`  💡  Astuces :`));
    console.log(chalk_1.default.gray(`    • Mentionnez un fichier avec @chemin (ex: "@src/interactive.ts") pour l'injecter.`));
    console.log(chalk_1.default.gray(`    • Exécutez une commande CLI directement avec $ (ex: "$export -c").`));
    console.log(chalk_1.default.gray(`  (Tapez "exit" ou "quit" pour quitter la discussion)\n`));
    // 4. Discussion loop
    while (true) {
        const userMsg = await (0, prompts_1.input)({ message: '👤  Vous :' });
        if (!userMsg.trim())
            continue;
        const lowerMsg = userMsg.toLowerCase();
        if (lowerMsg === 'exit' || lowerMsg === 'quit') {
            console.log(chalk_1.default.blue(`\n  👋 Fin de la discussion locale. Session sauvegardée. À bientôt !\n`));
            break;
        }
        // Direct CLI Command Execution from User
        if (userMsg.trim().startsWith('$')) {
            const cleanCmd = userMsg.trim();
            console.log(chalk_1.default.yellow(`\n  ⚙️  [Exécution de la commande CLI : code-caricature ${cleanCmd.substring(1)}]...`));
            const output = executeCLICommand(cleanCmd);
            console.log(chalk_1.default.gray(`\n  ═══ Résultat ═══\n`));
            console.log(output);
            console.log(chalk_1.default.gray(`  ════════════════\n`));
            continue;
        }
        let finalMsg = userMsg;
        const attachments = [];
        let totalAttachChars = 0;
        // Parse all @mentions in userMsg to load referenced files or folders
        const matches = userMsg.matchAll(/@([a-zA-Z0-9_\-\.\/\\+]+)/g);
        const seenPaths = new Set();
        for (const match of matches) {
            const matchPath = match[1].trim();
            const resolvedPath = path_1.default.resolve(targetDir, matchPath);
            if (seenPaths.has(resolvedPath))
                continue;
            seenPaths.add(resolvedPath);
            if (fs_1.default.existsSync(resolvedPath)) {
                const stats = fs_1.default.statSync(resolvedPath);
                if (stats.isFile()) {
                    try {
                        console.log(chalk_1.default.gray(`  [🔍 Lecture automatique du fichier : @${matchPath}]`));
                        let content = fs_1.default.readFileSync(resolvedPath, 'utf8');
                        if (content.length > MAX_FILE_INJECT_CHARS) {
                            content =
                                content.slice(0, MAX_FILE_INJECT_CHARS) +
                                    `\n\n[… fichier tronqué : ${content.length.toLocaleString()} caractères au total …]`;
                        }
                        if (totalAttachChars + content.length > MAX_TOTAL_ATTACH_CHARS) {
                            console.log(chalk_1.default.yellow(`  [⚠ Limite de contexte atteinte, fichier @${matchPath} ignoré]`));
                            continue;
                        }
                        totalAttachChars += content.length;
                        attachments.push(`📄 Fichier [@${matchPath}] :\n\`\`\`\n${content}\n\`\`\``);
                    }
                    catch (readErr) {
                        console.log(chalk_1.default.yellow(`  [⚠ Impossible de lire le fichier @${matchPath} : ${readErr.message}]`));
                    }
                }
                else if (stats.isDirectory()) {
                    try {
                        console.log(chalk_1.default.gray(`  [📁 Lecture automatique du dossier : @${matchPath}]`));
                        const files = fs_1.default.readdirSync(resolvedPath);
                        attachments.push(`📁 Dossier [@${matchPath}] (liste des fichiers) :\n${files.join('\n')}`);
                    }
                    catch (readErr) {
                        console.log(chalk_1.default.yellow(`  [⚠ Impossible de lire le dossier @${matchPath} : ${readErr.message}]`));
                    }
                }
            }
            else {
                console.log(chalk_1.default.yellow(`  [⚠ Cible introuvable : @${matchPath}]`));
            }
        }
        if (attachments.length > 0) {
            finalMsg += '\n\n' + attachments.join('\n\n');
        }
        // Save user message to history
        history.push({ role: 'user', content: finalMsg });
        (0, session_manager_1.saveSession)('chat', history);
        // Chat with the engine and handle potential tool calls ($ commands) from the AI
        try {
            let reply;
            try {
                reply = await engine.chat(finalMsg);
            }
            catch (cloudErr) {
                if (cloudErr.message === 'QUOTA_EXCEEDED' || engine.name.includes('OpenAI')) {
                    console.log(chalk_1.default.yellow(`  ⚠ Grande IA indisponible, basculement vers Qwen local...`));
                    const localSession = await ai_engine_1.AIEngine.createSession(systemPrompt);
                    engine = { name: 'Qwen (Local)', chat: (m) => localSession.chat(m) };
                    reply = await engine.chat(finalMsg);
                }
                else {
                    throw cloudErr;
                }
            }
            let agentTurn = 0;
            while (agentTurn < 3) {
                const lines = reply.split('\n');
                const cmdLines = lines.filter(l => l.trim().startsWith('$'));
                if (cmdLines.length === 0) {
                    if (!reply.trim()) {
                        console.log(chalk_1.default.yellow(`\n  ⚠ Réponse vide. Reformulez ou utilisez OPENAI_API_KEY.\n`));
                        break;
                    }
                    console.log(chalk_1.default.green.bold(`\n  🤖 ${engine.name} ═══\n`));
                    console.log(`  ${reply.split('\n').join('\n  ')}`);
                    console.log(chalk_1.default.green.bold(`\n  ════════════════\n`));
                    history.push({ role: 'assistant', content: reply });
                    (0, session_manager_1.saveSession)('chat', history);
                    break;
                }
                console.log(chalk_1.default.green.bold(`\n  🤖 ${engine.name} (Outil sollicité) ═══\n`));
                console.log(`  ${reply.split('\n').join('\n  ')}`);
                console.log(chalk_1.default.green.bold(`\n  ═════════════════════════════════\n`));
                const results = [];
                for (const line of cmdLines) {
                    const cleanCmd = line.trim();
                    const cmdText = cleanCmd.substring(1).trim();
                    const authorize = await (0, prompts_1.confirm)({
                        message: `🤖 L'IA locale souhaite exécuter la commande : ${chalk_1.default.bold('code-caricature ' + cmdText)}. Autoriser ?`,
                        default: true
                    });
                    if (authorize) {
                        console.log(chalk_1.default.yellow(`  ⚙️  [Exécution de la commande : code-caricature ${cmdText}]...`));
                        const out = executeCLICommand(cleanCmd);
                        results.push(`[Résultat de "code-caricature ${cmdText}"] :\n${out}`);
                    }
                    else {
                        console.log(chalk_1.default.red(`  ✗ Exécution annulée par l'utilisateur.`));
                        results.push(`[L'utilisateur a refusé l'exécution de la commande "code-caricature ${cmdText}"]`);
                    }
                }
                // Feed results back to the AI session
                reply = await engine.chat(`Voici les résultats des commandes exécutées :\n\n${results.join('\n\n')}\n\nAnalyse ces résultats et réponds à l'utilisateur.`);
                agentTurn++;
            }
        }
        catch (e) {
            console.error(chalk_1.default.red(`\n  ✗ Erreur de génération : ${e.message}\n`));
        }
    }
}
