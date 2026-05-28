#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const scanner_1 = require("./scanner");
const tokenCounter_1 = require("./tokenCounter");
const formatter_1 = require("./formatter");
const ast_parser_1 = require("./ast-parser");
const dep_graph_1 = require("./dep-graph");
const importer_1 = require("./importer");
const ui_1 = require("./ui");
const interactive_1 = require("./interactive");
const clipboardy_1 = __importDefault(require("clipboardy"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tutoriel_1 = require("./attitudes/tutoriel");
const version_1 = require("./version");
const program = new commander_1.Command();
program
    .name('code-caricature')
    .description('🎨 Fais la caricature de ton code, donne-la à ton IA !')
    .version((0, version_1.getPackageVersion)());
// ─── EXPORT COMMAND ─────────────────────────────────────────────────
program
    .command('export')
    .description('Exporter le contexte du projet (mode rapide)')
    .option('-t, --target <model>', 'Modèle cible : gpt ou claude', 'gpt')
    .option('-o, --output <file>', 'Sauvegarder dans un fichier')
    .option('-i, --include <exts>', 'Extensions (ex: .ts,.js)')
    .option('-s, --since <hours>', 'Fichiers modifiés depuis N heures')
    .option('-f, --focus <file>', 'Fichier à mettre en évidence')
    .option('-q, --issue <text>', 'Question/problème à injecter')
    .option('-a, --architecture', 'Mode Architecture (signatures uniquement)')
    .option('-g, --graph', 'Inclure le graphe de dépendances')
    .option('-c, --cost', 'Afficher l\'estimation du coût API')
    .option('--no-security', 'Désactiver le filtre de sécurité')
    .action((options) => {
    (0, ui_1.showBanner)();
    const targetDir = process.cwd();
    (0, ui_1.showStep)('🔍', `Scan : ${targetDir}`);
    let includeExts = [];
    if (options.include) {
        includeExts = options.include.split(',').map((e) => e.trim());
    }
    let sinceMs;
    if (options.since) {
        const hours = parseFloat(options.since);
        sinceMs = Date.now() - (hours * 60 * 60 * 1000);
        (0, ui_1.showStep)('🕐', `Filtre : modifiés dans les ${hours} dernières heures`);
    }
    const files = (0, scanner_1.scanDirectory)(targetDir, targetDir, undefined, { includeExts, sinceMs });
    (0, ui_1.showStep)('📁', `${files.length} fichiers trouvés`);
    // Read files with security
    const enableSecurity = options.security !== false;
    const { contents, securityReport } = (0, scanner_1.readFilesContent)(targetDir, files, enableSecurity);
    // Security report
    if (securityReport.length > 0) {
        (0, ui_1.showStep)('🔒', `Sécurité : ${securityReport.length} élément(s) caviardé(s)`);
        for (const report of securityReport) {
            console.log(`     ${report}`);
        }
    }
    const tree = (0, scanner_1.generateTree)(files);
    const targetModel = (options.target?.toLowerCase() === 'claude') ? 'claude' : 'gpt';
    const focusFiles = options.focus ? [options.focus] : [];
    // Architecture mode (AST)
    let architectureContents;
    if (options.architecture) {
        (0, ui_1.showStep)('🏗️', 'Mode Architecture : extraction des signatures...');
        architectureContents = {};
        for (const [filePath, content] of Object.entries(contents)) {
            if (content.startsWith('//'))
                continue; // Skip error files
            const sigs = (0, ast_parser_1.extractSignatures)(content, filePath);
            architectureContents[filePath] = (0, ast_parser_1.formatSignatures)(sigs, filePath);
        }
    }
    // Dependency graph
    let depGraphText;
    if (options.graph) {
        (0, ui_1.showStep)('🔗', 'Analyse du graphe de dépendances...');
        const graph = (0, dep_graph_1.buildDependencyGraph)(targetDir, files, contents);
        depGraphText = (0, dep_graph_1.formatDependencyGraph)(graph, focusFiles[0]);
    }
    (0, ui_1.showStep)('🎨', 'Création de la caricature...');
    const formatted = (0, formatter_1.formatContext)({
        tree,
        contents,
        target: targetModel,
        issue: options.issue,
        focus: focusFiles,
        architectureMode: !!options.architecture,
        architectureContents,
        dependencyGraph: depGraphText,
    });
    const tokens = (0, tokenCounter_1.countTokens)(formatted);
    (0, ui_1.showTokenCount)(tokens);
    // Cost estimation
    if (options.cost) {
        const costs = (0, formatter_1.estimateCost)(tokens);
        console.log((0, formatter_1.formatCostTable)(costs));
    }
    // Output (with clipboard error handling - Qwen #5)
    if (options.output) {
        const outPath = path_1.default.resolve(targetDir, options.output);
        fs_1.default.writeFileSync(outPath, formatted, 'utf8');
        (0, ui_1.showSuccess)(`Fichier créé : ${outPath}`);
        (0, ui_1.showInfo)('Glissez-déposez ce fichier dans votre IA Générale.');
    }
    else {
        try {
            clipboardy_1.default.writeSync(formatted);
            (0, ui_1.showSuccess)('Caricature copiée dans le presse-papiers !');
            (0, ui_1.showInfo)('Allez sur l\'interface de votre IA et appuyez sur Ctrl+V.');
        }
        catch (e) {
            // Fallback: save to file if clipboard fails
            const fallbackPath = path_1.default.resolve(targetDir, 'code-caricature.txt');
            fs_1.default.writeFileSync(fallbackPath, formatted, 'utf8');
            (0, ui_1.showWarning)('Impossible d\'accéder au presse-papiers.');
            (0, ui_1.showSuccess)(`Fichier de secours créé : ${fallbackPath}`);
            (0, ui_1.showInfo)('Glissez-déposez ce fichier dans votre IA Générale.');
        }
    }
});
// ─── IMPORT COMMAND ─────────────────────────────────────────────────
program
    .command('import')
    .description('Importer le code corrigé par l\'IA dans votre projet')
    .option('-f, --file <file>', 'Lire la réponse IA depuis un fichier')
    .option('-c, --clipboard', 'Lire la réponse IA depuis le presse-papiers')
    .option('--dry-run', 'Prévisualiser sans appliquer les changements')
    .action((options) => {
    (0, ui_1.showBanner)();
    const targetDir = process.cwd();
    let responseText;
    if (options.file) {
        const filePath = path_1.default.resolve(targetDir, options.file);
        if (!fs_1.default.existsSync(filePath)) {
            (0, ui_1.showWarning)(`Fichier non trouvé : ${filePath}`);
            return;
        }
        responseText = fs_1.default.readFileSync(filePath, 'utf8');
        (0, ui_1.showStep)('📄', `Lecture de la réponse IA depuis : ${filePath}`);
    }
    else if (options.clipboard) {
        try {
            responseText = clipboardy_1.default.readSync();
            (0, ui_1.showStep)('📋', 'Lecture de la réponse IA depuis le presse-papiers');
        }
        catch (e) {
            (0, ui_1.showWarning)('Impossible de lire le presse-papiers.');
            return;
        }
    }
    else {
        (0, ui_1.showWarning)('Utilisez --file ou --clipboard pour spécifier la source.');
        (0, ui_1.showInfo)('Exemple : code-caricature import --clipboard');
        (0, ui_1.showInfo)('Exemple : code-caricature import --file reponse-ia.md');
        return;
    }
    // Parse the AI response
    (0, ui_1.showStep)('🔍', 'Analyse de la réponse IA...');
    const blocks = (0, importer_1.parseAIResponse)(responseText);
    if (blocks.length === 0) {
        (0, ui_1.showWarning)('Aucun bloc de code avec chemin de fichier trouvé dans la réponse.');
        (0, ui_1.showInfo)('Astuce : L\'IA doit inclure le chemin du fichier dans ses blocs de code.');
        (0, ui_1.showInfo)('Formats reconnus :');
        (0, ui_1.showInfo)('  ```ts src/monFichier.ts');
        (0, ui_1.showInfo)('  ### `src/monFichier.ts`');
        (0, ui_1.showInfo)('  <file path="src/monFichier.ts">');
        return;
    }
    (0, ui_1.showSuccess)(`${blocks.length} bloc(s) de code trouvé(s) :`);
    // Show diff for each block
    for (const block of blocks) {
        const fullPath = path_1.default.resolve(targetDir, block.filePath);
        if (fs_1.default.existsSync(fullPath)) {
            const oldContent = fs_1.default.readFileSync(fullPath, 'utf8');
            console.log((0, importer_1.generateDiff)(oldContent, block.content, block.filePath));
        }
        else {
            (0, ui_1.showInfo)(`📝 Nouveau fichier : ${block.filePath} (${block.content.split('\n').length} lignes)`);
        }
    }
    if (options.dryRun) {
        (0, ui_1.showInfo)('Mode prévisualisation (--dry-run). Aucun fichier n\'a été modifié.');
        return;
    }
    // Apply changes
    (0, ui_1.showStep)('⚙️', 'Application des modifications...');
    const result = (0, importer_1.applyCodeBlocks)(targetDir, blocks);
    if (result.applied.length > 0) {
        (0, ui_1.showSuccess)(`${result.applied.length} fichier(s) mis à jour :`);
        for (const f of result.applied)
            console.log(`     ✏️  ${f}`);
    }
    if (result.created.length > 0) {
        (0, ui_1.showSuccess)(`${result.created.length} fichier(s) créé(s) :`);
        for (const f of result.created)
            console.log(`     🆕  ${f}`);
    }
    if (result.errors.length > 0) {
        (0, ui_1.showWarning)(`${result.errors.length} erreur(s) :`);
        for (const e of result.errors)
            console.log(`     ❌  ${e}`);
    }
});
// ─── HELP COMMAND ───────────────────────────────────────────────────
program
    .command('attitude <name>')
    .description("Lancer une attitude d'intelligence artificielle locale")
    .option('--transcript <file>', 'Chemin vers le fichier de transcription vidéo (ou "clipboard")')
    .action(async (name, options) => {
    (0, ui_1.showBanner)();
    if (name === 'tutoriel') {
        let transcriptPath = '';
        let isTemp = false;
        if (options.transcript === 'clipboard') {
            try {
                const text = clipboardy_1.default.readSync();
                if (!text.trim()) {
                    (0, ui_1.showWarning)('Le presse-papiers est vide ou invalide.');
                    return;
                }
                transcriptPath = path_1.default.resolve(process.cwd(), '.temp-transcript.txt');
                fs_1.default.writeFileSync(transcriptPath, text, 'utf8');
                isTemp = true;
                (0, ui_1.showStep)('📋', 'Transcription lue avec succès depuis le presse-papiers.');
            }
            catch (e) {
                (0, ui_1.showWarning)('Impossible de lire le presse-papiers.');
                return;
            }
        }
        else if (options.transcript) {
            transcriptPath = path_1.default.resolve(process.cwd(), options.transcript);
        }
        else {
            (0, ui_1.showWarning)("L'attitude 'tutoriel' requiert l'option --transcript <file> (ou --transcript clipboard).");
            return;
        }
        await (0, tutoriel_1.runTutorielAttitude)(transcriptPath);
        if (isTemp && fs_1.default.existsSync(transcriptPath)) {
            try {
                fs_1.default.unlinkSync(transcriptPath);
            }
            catch (e) { }
        }
    }
    else if (name === 'chat') {
        const { runLocalChatMode } = await Promise.resolve().then(() => __importStar(require('./attitudes/chat-local')));
        await runLocalChatMode();
    }
    else {
        (0, ui_1.showWarning)(`L'attitude "${name}" n'est pas encore implémentée.`);
    }
});
// ─── MCP COMMAND ────────────────────────────────────────────────────
program
    .command('mcp')
    .description('Démarrer le serveur Model Context Protocol (MCP) local')
    .action(async () => {
    const { runMcpServer } = await Promise.resolve().then(() => __importStar(require('./mcp-server')));
    await runMcpServer();
});
program
    .command('bridge')
    .description('Pont IDE ↔ IA externe : appliquer la réponse dans vos fichiers')
    .option('-c, --clipboard', 'Lire la réponse depuis le presse-papiers (défaut)')
    .option('-f, --file <file>', 'Lire la réponse depuis un fichier')
    .option('--dry-run', 'Prévisualiser sans modifier les fichiers')
    .action(async (options) => {
    (0, ui_1.showBanner)();
    const { printBridgeDiagram, applyBridgeResponse } = await Promise.resolve().then(() => __importStar(require('./bridge-workflow')));
    printBridgeDiagram();
    const targetDir = process.cwd();
    let text = '';
    if (options.file) {
        const fp = path_1.default.resolve(targetDir, options.file);
        if (!fs_1.default.existsSync(fp)) {
            (0, ui_1.showWarning)(`Fichier introuvable : ${fp}`);
            return;
        }
        text = fs_1.default.readFileSync(fp, 'utf8');
    }
    else {
        try {
            text = clipboardy_1.default.readSync();
        }
        catch {
            (0, ui_1.showWarning)('Utilisez --clipboard ou --file reponse.txt');
            return;
        }
    }
    await applyBridgeResponse(text, { dryRun: !!options.dryRun });
});
program
    .command('doctor')
    .description('Diagnostiquer le CLI (build, MCP, IA locale/cloud)')
    .action(async () => {
    const { runDoctor } = await Promise.resolve().then(() => __importStar(require('./doctor')));
    await runDoctor();
});
// ─── HELP COMMAND ───────────────────────────────────────────────────
program
    .command('help')
    .description('Afficher le guide complet avec toutes les commandes')
    .action(() => {
    (0, ui_1.showBanner)();
    (0, ui_1.showHelp)();
});
// ─── MODE INTERACTIF (par défaut) ───────────────────────────────────
const userArgs = process.argv.slice(2).filter((a) => a.length > 0);
if (userArgs.length === 0) {
    (0, interactive_1.runInteractiveMode)().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}
else {
    program.parse(process.argv);
}
