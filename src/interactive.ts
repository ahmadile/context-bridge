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
import { parseAIResponse, generateDiff, applyCodeBlocks } from './importer';
import clipboardy from 'clipboardy';
import { showBanner, showStep, showSuccess, showInfo, showWarning, showTokenCount } from './ui';

/**
 * The interactive menu mode - guides the user step by step
 */
export async function runInteractiveMode(): Promise<void> {
    showBanner();
    console.log(chalk.blue(`  📁  Dossier de travail actif : ${chalk.bold(process.cwd())}`));
    console.log(chalk.gray('  Bienvenue ! Ce menu va vous guider pas à pas.\n'));

    // Console quickstart tips
    console.log(chalk.cyan('  🚀 Commencer immédiatement en ligne de commande :'));
    console.log(chalk.gray(`     • ${chalk.bold('code-caricature export')}              - Exporter le contexte de votre code`));
    console.log(chalk.gray(`     • ${chalk.bold('code-caricature import --clipboard')}  - Importer les corrections depuis le presse-papiers`));
    console.log(chalk.gray(`     • ${chalk.bold('code-caricature attitude chat')}       - Lancer l'IA locale pour vous guider`));
    console.log('');

    // Step 1: Choose main action
    const mainAction = await select({
        message: '🎯  Que voulez-vous faire aujourd\'hui ?',
        choices: [
            {
                name: '📤  EXPORTER : Envoyer mon code à une IA',
                value: 'export',
                description: 'Préparer le contexte pour une IA Générale'
            },
            {
                name: '📥  IMPORTER : Appliquer les corrections de l\'IA',
                value: 'import',
                description: 'Intégrer le code généré dans mes fichiers'
            },
            {
                name: '🎓  MENTORAT : Lancer le tutoriel interactif',
                value: 'tutoriel',
                description: 'Suivre un tutoriel pas-à-pas guidé par l\'IA (Locale/OpenAI)'
            },
            {
                name: '💬  DISCUSSION : Parler en direct avec l\'IA locale',
                value: 'chat',
                description: 'Discuter avec Qwen2.5-Coder sur votre projet'
            },
            {
                name: '📖  Voir le guide d\'utilisation (Aide)',
                value: 'help',
            },
        ],
    });

    if (mainAction === 'help') {
        const { showHelp } = await import('./ui');
        showHelp();
        return;
    }

    if (mainAction === 'import') {
        await runInteractiveImport();
        return;
    }

    if (mainAction === 'chat') {
        const { runLocalChatMode } = await import('./attitudes/chat-local');
        await runLocalChatMode();
        return;
    }

    if (mainAction === 'tutoriel') {
        const source = await select({
            message: '📄  D\'où vient la transcription du tutoriel ?',
            choices: [
                { name: '📋  Depuis le presse-papiers (Ctrl+C sur YouTube/texte d\'abord)', value: 'clipboard' },
                { name: '📁  Depuis un fichier local', value: 'file' },
            ]
        });

        let resolvedPath = '';
        let isTemp = false;

        if (source === 'clipboard') {
            try {
                const text = clipboardy.readSync();
                if (!text.trim()) {
                    showWarning('Le presse-papiers est vide ou invalide.');
                    return;
                }
                resolvedPath = path.resolve(process.cwd(), '.temp-transcript.txt');
                fs.writeFileSync(resolvedPath, text, 'utf8');
                isTemp = true;
                showStep('📋', 'Transcription lue avec succès depuis le presse-papiers.');
            } catch (e) {
                showWarning('Impossible de lire le presse-papiers.');
                return;
            }
        } else {
            const transcriptPathInput = await input({
                message: '📄  Chemin du fichier (ex: transcript.txt) :',
                validate: (value) => {
                    if (!value.trim()) return 'Le chemin ne peut pas être vide.';
                    const fullPath = path.resolve(process.cwd(), value.trim());
                    if (!fs.existsSync(fullPath)) {
                        return `Fichier introuvable : ${fullPath}`;
                    }
                    return true;
                }
            });
            resolvedPath = path.resolve(process.cwd(), transcriptPathInput.trim());
        }

        const { runTutorielAttitude } = await import('./attitudes/tutoriel');
        await runTutorielAttitude(resolvedPath);

        if (isTemp && fs.existsSync(resolvedPath)) {
            try {
                fs.unlinkSync(resolvedPath);
            } catch (e) {}
        }
        return;
    }

    // --- EXPORT FLOW ---
    
    const exportMode = await select({
        message: '⚙️  Quel type d\'export voulez-vous ?',
        choices: [
            { name: '📋  Complet (Scan standard)', value: 'full' },
            { name: '🏗️  Architecture (Seulement la structure, léger)', value: 'architecture' },
            { name: '🔍  Filtré (Certaines extensions ou récents)', value: 'filter' },
        ],
    });

    let includeExts: string[] = [];
    let sinceMs: number | undefined;

    if (exportMode === 'filter') {
        const filterType = await select({
            message: 'Comment voulez-vous filtrer ?',
            choices: [
                { name: 'Par extensions (ex: .ts, .js)', value: 'ext' },
                { name: 'Par date (modifiés récemment)', value: 'date' },
            ]
        });

        if (filterType === 'ext') {
            const extsInput = await input({
                message: '📝  Quelles extensions ? (séparées par des virgules)',
                default: '.ts,.js',
            });
            includeExts = extsInput.split(',').map(e => e.trim());
        } else {
            const hoursInput = await input({
                message: '🕐  Depuis combien d\'heures ?',
                default: '24',
            });
            sinceMs = Date.now() - (parseFloat(hoursInput) * 60 * 60 * 1000);
        }
    }

    // Step 3: Focus file?
    const wantFocus = await confirm({
        message: '🔥  Voulez-vous mettre un fichier spécifique en évidence (Focus) ?',
        default: false,
    });

    let focusFiles: string[] = [];
    if (wantFocus) {
        const targetDir = process.cwd();
        const allFiles = scanDirectory(targetDir, targetDir, undefined, {});
        
        if (allFiles.length > 0) {
            const selected = await checkbox({
                message: '📂  Sélectionnez le(s) fichier(s) à cibler :',
                choices: allFiles.slice(0, 30).map(f => ({ name: f, value: f })),
            });
            focusFiles = selected;
        }
    }

    // Optional advanced features
    const wantGraph = await confirm({
        message: '🔗  Inclure le graphe de dépendances (fichiers liés) ?',
        default: false,
    });

    const wantIssue = await confirm({
        message: '❓  Voulez-vous ajouter une question pour l\'IA ?',
        default: false,
    });

    let issue: string | undefined;
    if (wantIssue) {
        issue = await input({
            message: '💬  Votre problème ou question :',
        });
    }

    const targetModel = await select({
        message: '🤖  Quel format d\'export voulez-vous utiliser ?',
        choices: [
            { name: '🟢  Format Markdown standard (ChatGPT, Gemini, Qwen, etc.)', value: 'gpt' as TargetModel },
            { name: '🟣  Format XML structuré (Claude, etc.)', value: 'claude' as TargetModel },
        ],
    });

    const outputMode = await select({
        message: '📤  Comment récupérer le résultat ?',
        choices: [
            { name: '📋  Presse-papiers (Ctrl+V ensuite)', value: 'clipboard' },
            { name: '📁  Fichier texte (Glisser-déposer)', value: 'file' },
        ],
    });

    // Execute Export
    console.log('\n' + chalk.gray('  ─────────────────────────────────────────────────────────'));
    const targetDir = process.cwd();
    showStep('🔍', `Scan : ${targetDir}`);

    const files = scanDirectory(targetDir, targetDir, undefined, { includeExts, sinceMs });
    showStep('📁', `${files.length} fichiers trouvés`);

    const { contents, securityReport } = readFilesContent(targetDir, files, true);

    if (securityReport.length > 0) {
        showStep('🔒', `Sécurité : ${securityReport.length} élément(s) masqué(s)`);
    }

    const tree = generateTree(files);
    
    let architectureContents: { [key: string]: string } | undefined;
    if (exportMode === 'architecture') {
        showStep('🏗️', 'Extraction de l\'architecture...');
        architectureContents = {};
        for (const [filePath, content] of Object.entries(contents)) {
            if (!content.startsWith('//')) {
                const sigs = extractSignatures(content, filePath);
                architectureContents[filePath] = formatSignatures(sigs, filePath);
            }
        }
    }

    let depGraphText: string | undefined;
    if (wantGraph) {
        showStep('🔗', 'Analyse des dépendances...');
        const graph = buildDependencyGraph(targetDir, files, contents);
        depGraphText = formatDependencyGraph(graph, focusFiles[0]);
    }

    showStep('🎨', 'Création de la caricature...');

    const formatted = formatContext({
        tree,
        contents,
        target: targetModel,
        issue,
        focus: focusFiles,
        architectureMode: exportMode === 'architecture',
        architectureContents,
        dependencyGraph: depGraphText,
    });

    const tokens = countTokens(formatted);
    showTokenCount(tokens);
    
    const costs = estimateCost(tokens);
    console.log(formatCostTable(costs));

    if (outputMode === 'file') {
        const outPath = path.resolve(targetDir, 'code-caricature.txt');
        fs.writeFileSync(outPath, formatted, 'utf8');
        showSuccess(`Fichier créé : ${outPath}`);
    } else {
        try {
            clipboardy.writeSync(formatted);
            showSuccess('Copié dans le presse-papiers !');
        } catch (e) {
            const outPath = path.resolve(targetDir, 'code-caricature.txt');
            fs.writeFileSync(outPath, formatted, 'utf8');
            showWarning('Presse-papiers inaccessible. Fichier de secours créé.');
        }
    }
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────\n'));
}

/**
 * Interactive flow for importing AI code
 */
async function runInteractiveImport(): Promise<void> {
    const source = await select({
        message: '📥  D\'où vient le code de l\'IA ?',
        choices: [
            { name: '📋  Je viens de le copier (Presse-papiers)', value: 'clipboard' },
            { name: '📄  Il est dans un fichier', value: 'file' },
        ],
    });

    let responseText = '';
    const targetDir = process.cwd();

    if (source === 'clipboard') {
        try {
            responseText = clipboardy.readSync();
            showStep('📋', 'Lecture depuis le presse-papiers...');
        } catch (e) {
            showWarning('Impossible de lire le presse-papiers.');
            return;
        }
    } else {
        const filePath = await input({ message: 'Chemin du fichier (ex: reponse.txt) :' });
        try {
            responseText = fs.readFileSync(path.resolve(targetDir, filePath), 'utf8');
            showStep('📄', 'Lecture du fichier...');
        } catch (e) {
            showWarning('Fichier introuvable ou illisible.');
            return;
        }
    }

    const blocks = parseAIResponse(responseText);
    
    if (blocks.length === 0) {
        showWarning('Aucun bloc de code avec chemin reconnu n\'a été trouvé.');
        return;
    }

    showSuccess(`${blocks.length} fichier(s) détecté(s) dans la réponse.`);
    
    for (const block of blocks) {
        const fullPath = path.resolve(targetDir, block.filePath);
        const oldContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
        console.log(generateDiff(oldContent, block.content, block.filePath));
    }

    const apply = await confirm({
        message: '⚠️  Voulez-vous appliquer ces modifications à votre projet ?',
        default: false,
    });

    if (apply) {
        const result = applyCodeBlocks(targetDir, blocks);
        if (result.applied.length > 0) showSuccess(`${result.applied.length} fichier(s) mis à jour.`);
        if (result.created.length > 0) showSuccess(`${result.created.length} fichier(s) créé(s).`);
        if (result.errors.length > 0) showWarning(`${result.errors.length} erreur(s) rencontrée(s).`);
    } else {
        showInfo('Import annulé. Aucune modification n\'a été faite.');
    }
}
