#!/usr/bin/env node
import { Command } from 'commander';
import { scanDirectory, generateTree, readFilesContent } from './scanner';
import { countTokens } from './tokenCounter';
import { formatContext, TargetModel, estimateCost, formatCostTable } from './formatter';
import { extractSignatures, formatSignatures } from './ast-parser';
import { buildDependencyGraph, getRelatedFiles, formatDependencyGraph } from './dep-graph';
import { parseAIResponse, generateDiff, applyCodeBlocks } from './importer';
import { showBanner, showHelp, showStep, showSuccess, showWarning, showInfo, showTokenCount } from './ui';
import { runInteractiveMode } from './interactive';
import clipboardy from 'clipboardy';
import fs from 'fs';
import path from 'path';
import { runTutorielAttitude } from './attitudes/tutoriel';
import { getPackageVersion } from './version';
import { watchCommand } from './commands/watch-cmd';
import { assistCommand } from './commands/assist-cmd';
const program = new Command();

program
    .name('code-caricature')
    .description('🎨 Fais la caricature de ton code, donne-la à ton IA !')
    .version(getPackageVersion());

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
        showBanner();

        const targetDir = process.cwd();
        showStep('🔍', `Scan : ${targetDir}`);

        let includeExts: string[] = [];
        if (options.include) {
            includeExts = options.include.split(',').map((e: string) => e.trim());
        }

        let sinceMs: number | undefined;
        if (options.since) {
            const hours = parseFloat(options.since);
            sinceMs = Date.now() - (hours * 60 * 60 * 1000);
            showStep('🕐', `Filtre : modifiés dans les ${hours} dernières heures`);
        }

        const files = scanDirectory(targetDir, targetDir, undefined, { includeExts, sinceMs });
        showStep('📁', `${files.length} fichiers trouvés`);

        // Read files with security
        const enableSecurity = options.security !== false;
        const { contents, securityReport } = readFilesContent(targetDir, files, enableSecurity);

        // Security report
        if (securityReport.length > 0) {
            showStep('🔒', `Sécurité : ${securityReport.length} élément(s) caviardé(s)`);
            for (const report of securityReport) {
                console.log(`     ${report}`);
            }
        }

        const tree = generateTree(files);
        const targetModel: TargetModel = (options.target?.toLowerCase() === 'claude') ? 'claude' : 'gpt';
        const focusFiles = options.focus ? [options.focus] : [];

        // Architecture mode (AST)
        let architectureContents: { [key: string]: string } | undefined;
        if (options.architecture) {
            showStep('🏗️', 'Mode Architecture : extraction des signatures...');
            architectureContents = {};
            for (const [filePath, content] of Object.entries(contents)) {
                if (content.startsWith('//')) continue; // Skip error files
                const sigs = extractSignatures(content, filePath);
                architectureContents[filePath] = formatSignatures(sigs, filePath);
            }
        }

        // Dependency graph
        let depGraphText: string | undefined;
        if (options.graph) {
            showStep('🔗', 'Analyse du graphe de dépendances...');
            const graph = buildDependencyGraph(targetDir, files, contents);
            depGraphText = formatDependencyGraph(graph, focusFiles[0]);
        }

        showStep('🎨', 'Création de la caricature...');

        const formatted = formatContext({
            tree,
            contents,
            target: targetModel,
            issue: options.issue,
            focus: focusFiles,
            architectureMode: !!options.architecture,
            architectureContents,
            dependencyGraph: depGraphText,
        });

        const tokens = countTokens(formatted);
        showTokenCount(tokens);

        // Cost estimation
        if (options.cost) {
            const costs = estimateCost(tokens);
            console.log(formatCostTable(costs));
        }

        // Output (with clipboard error handling - Qwen #5)
        if (options.output) {
            const outPath = path.resolve(targetDir, options.output);
            fs.writeFileSync(outPath, formatted, 'utf8');
            showSuccess(`Fichier créé : ${outPath}`);
            showInfo('Glissez-déposez ce fichier dans votre IA Générale.');
        } else {
            try {
                clipboardy.writeSync(formatted);
                showSuccess('Caricature copiée dans le presse-papiers !');
                showInfo('Allez sur l\'interface de votre IA et appuyez sur Ctrl+V.');
            } catch (e) {
                // Fallback: save to file if clipboard fails
                const fallbackPath = path.resolve(targetDir, 'code-caricature.txt');
                fs.writeFileSync(fallbackPath, formatted, 'utf8');
                showWarning('Impossible d\'accéder au presse-papiers.');
                showSuccess(`Fichier de secours créé : ${fallbackPath}`);
                showInfo('Glissez-déposez ce fichier dans votre IA Générale.');
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
        showBanner();
        const targetDir = process.cwd();

        let responseText: string;

        if (options.file) {
            const filePath = path.resolve(targetDir, options.file);
            if (!fs.existsSync(filePath)) {
                showWarning(`Fichier non trouvé : ${filePath}`);
                return;
            }
            responseText = fs.readFileSync(filePath, 'utf8');
            showStep('📄', `Lecture de la réponse IA depuis : ${filePath}`);
        } else if (options.clipboard) {
            try {
                responseText = clipboardy.readSync();
                showStep('📋', 'Lecture de la réponse IA depuis le presse-papiers');
            } catch (e) {
                showWarning('Impossible de lire le presse-papiers.');
                return;
            }
        } else {
            showWarning('Utilisez --file ou --clipboard pour spécifier la source.');
            showInfo('Exemple : code-caricature import --clipboard');
            showInfo('Exemple : code-caricature import --file reponse-ia.md');
            return;
        }

        // Parse the AI response
        showStep('🔍', 'Analyse de la réponse IA...');
        const blocks = parseAIResponse(responseText);

        if (blocks.length === 0) {
            showWarning('Aucun bloc de code avec chemin de fichier trouvé dans la réponse.');
            showInfo('Astuce : L\'IA doit inclure le chemin du fichier dans ses blocs de code.');
            showInfo('Formats reconnus :');
            showInfo('  ```ts src/monFichier.ts');
            showInfo('  ### `src/monFichier.ts`');
            showInfo('  <file path="src/monFichier.ts">');
            return;
        }

        showSuccess(`${blocks.length} bloc(s) de code trouvé(s) :`);

        // Show diff for each block
        for (const block of blocks) {
            const fullPath = path.resolve(targetDir, block.filePath);
            if (fs.existsSync(fullPath)) {
                const oldContent = fs.readFileSync(fullPath, 'utf8');
                console.log(generateDiff(oldContent, block.content, block.filePath));
            } else {
                showInfo(`📝 Nouveau fichier : ${block.filePath} (${block.content.split('\n').length} lignes)`);
            }
        }

        if (options.dryRun) {
            showInfo('Mode prévisualisation (--dry-run). Aucun fichier n\'a été modifié.');
            return;
        }

        // Apply changes
        showStep('⚙️', 'Application des modifications...');
        const result = applyCodeBlocks(targetDir, blocks);

        if (result.applied.length > 0) {
            showSuccess(`${result.applied.length} fichier(s) mis à jour :`);
            for (const f of result.applied) console.log(`     ✏️  ${f}`);
        }
        if (result.created.length > 0) {
            showSuccess(`${result.created.length} fichier(s) créé(s) :`);
            for (const f of result.created) console.log(`     🆕  ${f}`);
        }
        if (result.errors.length > 0) {
            showWarning(`${result.errors.length} erreur(s) :`);
            for (const e of result.errors) console.log(`     ❌  ${e}`);
        }
    });

// ─── HELP COMMAND ───────────────────────────────────────────────────

program
    .command('attitude <name>')
    .description("Lancer une attitude d'intelligence artificielle locale")
    .option('--transcript <file>', 'Chemin vers le fichier de transcription vidéo (ou "clipboard")')
    .action(async (name, options) => {
        showBanner();
        if (name === 'tutoriel') {
            let transcriptPath = '';
            let isTemp = false;

            if (options.transcript === 'clipboard') {
                try {
                    const text = clipboardy.readSync();
                    if (!text.trim()) {
                        showWarning('Le presse-papiers est vide ou invalide.');
                        return;
                    }
                    transcriptPath = path.resolve(process.cwd(), '.temp-transcript.txt');
                    fs.writeFileSync(transcriptPath, text, 'utf8');
                    isTemp = true;
                    showStep('📋', 'Transcription lue avec succès depuis le presse-papiers.');
                } catch (e) {
                    showWarning('Impossible de lire le presse-papiers.');
                    return;
                }
            } else if (options.transcript) {
                transcriptPath = path.resolve(process.cwd(), options.transcript);
            } else {
                showWarning("L'attitude 'tutoriel' requiert l'option --transcript <file> (ou --transcript clipboard).");
                return;
            }

            await runTutorielAttitude(transcriptPath);

            if (isTemp && fs.existsSync(transcriptPath)) {
                try {
                    fs.unlinkSync(transcriptPath);
                } catch (e) {}
            }
        } else if (name === 'chat') {
            const { runLocalChatMode } = await import('./attitudes/chat-local');
            await runLocalChatMode();
        } else {
            showWarning(`L'attitude "${name}" n'est pas encore implémentée.`);
        }
    });

// ─── MCP COMMAND ────────────────────────────────────────────────────

program
    .command('mcp')
    .description('Démarrer le serveur Model Context Protocol (MCP) local')
    .action(async () => {
        const { runMcpServer } = await import('./mcp-server');
        await runMcpServer();
    });

program
    .command('bridge')
    .description('Pont IDE ↔ IA externe : appliquer la réponse dans vos fichiers')
    .option('-c, --clipboard', 'Lire la réponse depuis le presse-papiers (défaut)')
    .option('-f, --file <file>', 'Lire la réponse depuis un fichier')
    .option('--dry-run', 'Prévisualiser sans modifier les fichiers')
    .action(async (options) => {
        showBanner();
        const { printBridgeDiagram, applyBridgeResponse } = await import('./bridge-workflow');
        printBridgeDiagram();
        const targetDir = process.cwd();
        let text = '';
        if (options.file) {
            const fp = path.resolve(targetDir, options.file);
            if (!fs.existsSync(fp)) {
                showWarning(`Fichier introuvable : ${fp}`);
                return;
            }
            text = fs.readFileSync(fp, 'utf8');
        } else {
            try {
                text = clipboardy.readSync();
            } catch {
                showWarning('Utilisez --clipboard ou --file reponse.txt');
                return;
            }
        }
        await applyBridgeResponse(text, { dryRun: !!options.dryRun });
    });

program
    .command('doctor')
    .description('Diagnostiquer le CLI (build, MCP, IA locale/cloud)')
    .action(async () => {
        const { runDoctor } = await import('./doctor');
        await runDoctor();
    });

// ─── HELP COMMAND ───────────────────────────────────────────────────

program
    .command('help')
    .description('Afficher le guide complet avec toutes les commandes')
    .action(() => {
        showBanner();
        showHelp();
    });

    program.addCommand(watchCommand);
program.addCommand(assistCommand);
// ─── MODE INTERACTIF (par défaut) ───────────────────────────────────
const userArgs = process.argv.slice(2).filter((a) => a.length > 0);

if (userArgs.length === 0) {
    runInteractiveMode().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
} else {
    program.parse(process.argv);
}
