"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyChatGPTInstructions = exports.runBridgeImportFromChatGPT = exports.CHATGPT_IMPORT_INSTRUCTION = exports.EXTERNAL_AI_IMPORT_INSTRUCTION = void 0;
exports.printBridgeDiagram = printBridgeDiagram;
exports.applyBridgeResponse = applyBridgeResponse;
exports.runBridgeImportFromExternal = runBridgeImportFromExternal;
exports.copyExternalAiInstructions = copyExternalAiInstructions;
/**
 * Pont IDE ↔ IA externe (navigateur ou autre client).
 * Export/import de fichiers : sans IA. L'IA du CLI intervient ailleurs (compagnon, chat).
 */
const chalk_1 = __importDefault(require("chalk"));
const prompts_1 = require("@inquirer/prompts");
const clipboardy_1 = __importDefault(require("clipboardy"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ui_1 = require("./ui");
const importer_1 = require("./importer");
const companion_session_1 = require("./companion-session");
/** Instructions à coller dans votre IA externe pour des réponses importables. */
exports.EXTERNAL_AI_IMPORT_INSTRUCTION = `Quand tu proposes du code à appliquer dans mon projet, utilise TOUJOURS ce format pour chaque fichier :

\`\`\`typescript chemin/relatif/vers/fichier.ts
// contenu complet du fichier ou du correctif
\`\`\`

Remplace "typescript" par le langage réel et mets le chemin relatif depuis la racine du projet.
Un bloc = un fichier. Ne mélange pas plusieurs fichiers dans un seul bloc sans chemin.`;
/** @deprecated Alias */
exports.CHATGPT_IMPORT_INSTRUCTION = exports.EXTERNAL_AI_IMPORT_INSTRUCTION;
function printBridgeDiagram() {
    console.log(chalk_1.default.cyan.bold('\n  🌉  Pont IDE ↔ votre IA externe\n'));
    console.log(chalk_1.default.gray('  ┌─────────────┐         ┌──────────────────┐         ┌─────────────┐'));
    console.log(chalk_1.default.gray('  │  Votre IDE  │  (1)    │  code-caricature │  (2)    │  IA externe │'));
    console.log(chalk_1.default.gray('  │             │ ──────► │  CLI (export)    │ ──────► │ (navigateur)│'));
    console.log(chalk_1.default.gray('  └─────────────┘         └──────────────────┘         └─────────────┘'));
    console.log(chalk_1.default.gray('        ▲                          │                          │'));
    console.log(chalk_1.default.gray('        │         (4) import       │         (3) copier       │'));
    console.log(chalk_1.default.gray('        └──────────────────────────┴──────────────────────────┘'));
    console.log(chalk_1.default.gray('              Fichiers mis à jour dans le projet\n'));
    console.log(chalk_1.default.white('  Étapes :'));
    console.log(chalk_1.default.gray('    1. Export : scan du projet → presse-papiers'));
    console.log(chalk_1.default.gray('    2. Collez dans votre IA + décrivez votre besoin'));
    console.log(chalk_1.default.gray('    3. Copiez la réponse (Ctrl+C)'));
    console.log(chalk_1.default.gray('    4. Import : le CLI écrit les fichiers\n'));
}
async function applyBridgeResponse(responseText, options = {}) {
    const targetDir = process.cwd();
    const preview = (0, companion_session_1.validateImportPreview)(responseText);
    if ((0, companion_session_1.loadLinkedSession)() && preview.warnings.length > 0) {
        console.log(chalk_1.default.yellow('\n  🤝  Compagnon (session liée) — alertes :\n'));
        for (const w of preview.warnings)
            (0, ui_1.showWarning)(w);
    }
    const blocks = (0, importer_1.parseAIResponse)(responseText);
    if (blocks.length === 0) {
        (0, ui_1.showWarning)('Aucun bloc de code avec chemin de fichier détecté.');
        (0, ui_1.showInfo)('Demandez à votre IA d\'utiliser ce format :');
        console.log(chalk_1.default.gray('  ```ts src/monFichier.ts'));
        console.log(chalk_1.default.gray('  // votre code'));
        console.log(chalk_1.default.gray('  ```'));
        (0, ui_1.showInfo)('Menu : « Copier les instructions pour l\'IA externe ».');
        return false;
    }
    (0, ui_1.showSuccess)(`${blocks.length} fichier(s) détecté(s) :`);
    for (const block of blocks) {
        const fullPath = path_1.default.resolve(targetDir, block.filePath);
        const oldContent = fs_1.default.existsSync(fullPath) ? fs_1.default.readFileSync(fullPath, 'utf8') : '';
        console.log((0, importer_1.generateDiff)(oldContent, block.content, block.filePath));
    }
    if (options.dryRun) {
        (0, ui_1.showInfo)('Prévisualisation — aucun fichier modifié.');
        return true;
    }
    let apply = options.autoConfirm ?? false;
    if (!apply) {
        apply = await (0, prompts_1.confirm)({
            message: '✅  Appliquer ces modifications dans votre projet ?',
            default: true,
        });
    }
    if (!apply) {
        (0, ui_1.showInfo)('Import annulé.');
        return false;
    }
    (0, ui_1.showStep)('⚙️', 'Écriture des fichiers…');
    const result = (0, importer_1.applyCodeBlocks)(targetDir, blocks);
    if (result.applied.length > 0) {
        (0, ui_1.showSuccess)(`${result.applied.length} fichier(s) mis à jour :`);
        for (const f of result.applied)
            console.log(chalk_1.default.green(`     ✏️  ${f}`));
    }
    if (result.created.length > 0) {
        (0, ui_1.showSuccess)(`${result.created.length} fichier(s) créé(s) :`);
        for (const f of result.created)
            console.log(chalk_1.default.green(`     🆕  ${f}`));
    }
    if (result.errors.length > 0) {
        (0, ui_1.showWarning)(`${result.errors.length} erreur(s) :`);
        for (const e of result.errors)
            console.log(chalk_1.default.red(`     ❌  ${e}`));
    }
    (0, companion_session_1.recordImport)(result.applied, result.created, result.errors);
    (0, ui_1.showInfo)('Retournez dans votre IDE : les fichiers sont à jour.');
    return true;
}
async function runBridgeImportFromExternal(options = {}) {
    if (options.showDiagram) {
        printBridgeDiagram();
    }
    console.log(chalk_1.default.yellow.bold('  📥  Importer la réponse de votre IA\n'));
    const source = await (0, prompts_1.select)({
        message: 'Source de la réponse ?',
        choices: [
            { name: '📋  Presse-papiers (Ctrl+C)', value: 'clipboard' },
            { name: '📄  Fichier local', value: 'file' },
        ],
    });
    let responseText = '';
    const targetDir = process.cwd();
    if (source === 'clipboard') {
        try {
            responseText = clipboardy_1.default.readSync();
            if (!responseText.trim()) {
                (0, ui_1.showWarning)('Presse-papiers vide.');
                return;
            }
            (0, ui_1.showStep)('📋', 'Lecture du presse-papiers');
        }
        catch {
            (0, ui_1.showWarning)('Impossible de lire le presse-papiers.');
            return;
        }
    }
    else {
        const filePath = await (0, prompts_1.input)({ message: 'Chemin du fichier :', default: 'reponse-ia.txt' });
        const full = path_1.default.resolve(targetDir, filePath.trim());
        if (!fs_1.default.existsSync(full)) {
            (0, ui_1.showWarning)(`Fichier introuvable : ${full}`);
            return;
        }
        responseText = fs_1.default.readFileSync(full, 'utf8');
        (0, ui_1.showStep)('📄', `Lecture : ${full}`);
    }
    await applyBridgeResponse(responseText);
}
/** @deprecated */
exports.runBridgeImportFromChatGPT = runBridgeImportFromExternal;
function copyExternalAiInstructions() {
    try {
        clipboardy_1.default.writeSync(exports.EXTERNAL_AI_IMPORT_INSTRUCTION);
        (0, ui_1.showSuccess)('Instructions copiées — collez-les une fois dans votre conversation IA.');
    }
    catch {
        (0, ui_1.showWarning)('Presse-papiers inaccessible.');
        console.log(chalk_1.default.gray('\n' + exports.EXTERNAL_AI_IMPORT_INSTRUCTION + '\n'));
    }
}
/** @deprecated */
exports.copyChatGPTInstructions = copyExternalAiInstructions;
