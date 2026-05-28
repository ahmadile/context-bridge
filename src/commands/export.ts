/**
 * commands/export.ts
 * Commande export - Exporter le contexte du projet (mode rapide)
 */
import { scanDirectory, generateTree, readFilesContent } from '../scanner';
import { countTokens } from '../tokenCounter';
import { formatContext, TargetModel, estimateCost, formatCostTable } from '../formatter';
import { extractSignatures, formatSignatures } from '../ast-parser';
import { buildDependencyGraph, formatDependencyGraph } from '../dep-graph';
import { showBanner, showStep, showSuccess, showWarning, showInfo, showTokenCount } from '../ui';
import clipboardy from 'clipboardy';
import fs from 'fs';
import path from 'path';

export interface ExportOptions {
    target?: string;
    output?: string;
    include?: string;
    since?: string;
    focus?: string;
    issue?: string;
    architecture?: boolean;
    graph?: boolean;
    cost?: boolean;
    security?: boolean;
}

export async function runExport(options: ExportOptions): Promise<void> {
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

    // Output (with clipboard error handling)
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
}
