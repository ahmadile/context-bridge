"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInteractiveExport = runInteractiveExport;
/**
 * Export interactif du contexte projet (évite import circulaire avec interactive / companion).
 */
const chalk_1 = __importDefault(require("chalk"));
const prompts_1 = require("@inquirer/prompts");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const clipboardy_1 = __importDefault(require("clipboardy"));
const scanner_1 = require("./scanner");
const tokenCounter_1 = require("./tokenCounter");
const formatter_1 = require("./formatter");
const ast_parser_1 = require("./ast-parser");
const ui_1 = require("./ui");
const bridge_workflow_1 = require("./bridge-workflow");
const companion_session_1 = require("./companion-session");
async function runInteractiveExport(options = {}) {
    if (!options.skipBanner && options.bridgeMode) {
        console.log(chalk_1.default.cyan.bold('\n  📤  Export — envoyer le projet à votre IA\n'));
    }
    const addInstructions = options.bridgeMode
        ? await (0, prompts_1.confirm)({
            message: 'Ajouter votre question + le format pour l\'import ?',
            default: true,
        })
        : false;
    let issue;
    if (addInstructions) {
        const q = await (0, prompts_1.input)({
            message: 'Votre question :',
            default: 'Analyse ce projet et propose les corrections.',
        });
        issue = `${q}\n\n---\n${bridge_workflow_1.EXTERNAL_AI_IMPORT_INSTRUCTION}`;
    }
    const exportMode = await (0, prompts_1.select)({
        message: 'Type d\'export :',
        choices: [
            { name: 'Architecture (léger)', value: 'architecture' },
            { name: 'Complet', value: 'full' },
            { name: 'Fichiers récents / extensions', value: 'filter' },
        ],
    });
    let includeExts = [];
    let sinceMs;
    if (exportMode === 'filter') {
        const filterType = await (0, prompts_1.select)({
            message: 'Filtre :',
            choices: [
                { name: 'Extensions', value: 'ext' },
                { name: 'Modifiés récemment', value: 'date' },
            ],
        });
        if (filterType === 'ext') {
            const extsInput = await (0, prompts_1.input)({ message: 'Extensions :', default: '.ts,.tsx,.js' });
            includeExts = extsInput.split(',').map((e) => e.trim());
        }
        else {
            const hoursInput = await (0, prompts_1.input)({ message: 'Depuis (heures) :', default: '48' });
            sinceMs = Date.now() - parseFloat(hoursInput) * 60 * 60 * 1000;
        }
    }
    let focusFiles = [];
    if (await (0, prompts_1.confirm)({ message: 'Fichier(s) en focus ?', default: false })) {
        const targetDir = process.cwd();
        const allFiles = (0, scanner_1.scanDirectory)(targetDir, targetDir, undefined, {});
        if (allFiles.length > 0) {
            focusFiles = await (0, prompts_1.checkbox)({
                message: 'Fichiers :',
                choices: allFiles.slice(0, 30).map((f) => ({ name: f, value: f })),
            });
        }
    }
    const targetDir = process.cwd();
    (0, ui_1.showStep)('🔍', `Scan : ${targetDir}`);
    const files = (0, scanner_1.scanDirectory)(targetDir, targetDir, undefined, { includeExts, sinceMs });
    (0, ui_1.showStep)('📁', `${files.length} fichiers`);
    const { contents, securityReport } = (0, scanner_1.readFilesContent)(targetDir, files, true);
    if (securityReport.length > 0) {
        (0, ui_1.showStep)('🔒', `${securityReport.length} masqué(s)`);
    }
    const tree = (0, scanner_1.generateTree)(files);
    let architectureContents;
    if (exportMode === 'architecture') {
        architectureContents = {};
        for (const [filePath, content] of Object.entries(contents)) {
            if (!content.startsWith('//')) {
                architectureContents[filePath] = (0, ast_parser_1.formatSignatures)((0, ast_parser_1.extractSignatures)(content, filePath), filePath);
            }
        }
    }
    const formatted = (0, formatter_1.formatContext)({
        tree,
        contents,
        target: 'gpt',
        issue,
        focus: focusFiles,
        architectureMode: exportMode === 'architecture',
        architectureContents,
    });
    (0, ui_1.showTokenCount)((0, tokenCounter_1.countTokens)(formatted));
    try {
        clipboardy_1.default.writeSync(formatted);
        (0, ui_1.showSuccess)('Copié dans le presse-papiers.');
    }
    catch {
        const outPath = path_1.default.resolve(targetDir, 'code-caricature.txt');
        fs_1.default.writeFileSync(outPath, formatted, 'utf8');
        (0, ui_1.showSuccess)(`Fichier : ${outPath}`);
    }
    if (options.bridgeMode) {
        (0, companion_session_1.recordExport)(files.length);
        console.log(chalk_1.default.cyan('\n  ▶  Collez dans votre IA, puis : menu « Importer réponse IA ».\n'));
    }
}
