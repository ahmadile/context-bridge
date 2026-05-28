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
exports.loadLinkedSession = loadLinkedSession;
exports.saveLinkedSession = saveLinkedSession;
exports.startLinkedSession = startLinkedSession;
exports.endLinkedSession = endLinkedSession;
exports.recordExport = recordExport;
exports.recordImport = recordImport;
exports.validateImportPreview = validateImportPreview;
exports.runCompanionLoop = runCompanionLoop;
/**
 * Session liée : accompagne export/import pendant une discussion avec une IA externe.
 * L'IA du CLI intervient surtout en cas d'erreur ou de doute (pas pour remplacer l'import).
 */
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const prompts_1 = require("@inquirer/prompts");
const ui_1 = require("./ui");
const importer_1 = require("./importer");
const sessionRoot = path_1.default.join(os_1.default.homedir(), '.code-caricature', 'sessions');
function sessionPath() {
    const hash = crypto_1.default.createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16);
    return path_1.default.join(sessionRoot, `linked-${hash}.json`);
}
function loadLinkedSession() {
    try {
        const p = sessionPath();
        if (!fs_1.default.existsSync(p))
            return null;
        const data = JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
        if (data.cwd !== process.cwd() || !data.active)
            return null;
        return data;
    }
    catch {
        return null;
    }
}
function saveLinkedSession(data) {
    fs_1.default.mkdirSync(sessionRoot, { recursive: true });
    fs_1.default.writeFileSync(sessionPath(), JSON.stringify(data, null, 2), 'utf8');
}
function startLinkedSession() {
    const session = {
        cwd: process.cwd(),
        startedAt: new Date().toISOString(),
        active: true,
    };
    saveLinkedSession(session);
    return session;
}
function endLinkedSession() {
    const s = loadLinkedSession();
    if (s) {
        s.active = false;
        saveLinkedSession(s);
    }
}
function recordExport(fileCount) {
    const s = loadLinkedSession() || startLinkedSession();
    s.lastAction = 'export';
    s.lastActionAt = new Date().toISOString();
    s.lastExportFiles = fileCount;
    saveLinkedSession(s);
}
function recordImport(applied, created, errors) {
    const s = loadLinkedSession() || startLinkedSession();
    s.lastAction = 'import';
    s.lastActionAt = new Date().toISOString();
    s.lastImportFiles = [...applied, ...created];
    s.lastImportErrors = errors;
    saveLinkedSession(s);
}
/** Vérifie une réponse IA avant application (chemins, blocs). */
function validateImportPreview(responseText) {
    const warnings = [];
    const blocks = (0, importer_1.parseAIResponse)(responseText);
    const cwd = process.cwd();
    if (blocks.length === 0) {
        warnings.push('Aucun bloc ```lang chemin/fichier``` détecté — l\'import échouera probablement.');
        return { ok: false, blockCount: 0, warnings };
    }
    for (const b of blocks) {
        const resolved = path_1.default.resolve(cwd, b.filePath);
        if (!resolved.startsWith(cwd)) {
            warnings.push(`Chemin suspect (hors projet) : ${b.filePath}`);
        }
        if (b.filePath.includes('..')) {
            warnings.push(`Chemin avec ".." : ${b.filePath}`);
        }
    }
    return { ok: warnings.length === 0, blockCount: blocks.length, warnings };
}
async function runCompanionLoop() {
    let session = loadLinkedSession();
    if (!session) {
        const start = await (0, prompts_1.confirm)({
            message: 'Démarrer une session liée pour cette discussion avec votre IA externe ?',
            default: true,
        });
        if (!start)
            return;
        session = startLinkedSession();
    }
    console.log(chalk_1.default.cyan.bold('\n  🤝  Session liée — compagnon CLI\n'));
    console.log(chalk_1.default.gray(`  Projet : ${session.cwd}`));
    console.log(chalk_1.default.gray(`  Depuis : ${new Date(session.startedAt).toLocaleString()}\n`));
    console.log(chalk_1.default.white('  Rôle du compagnon :'));
    console.log(chalk_1.default.gray('    • Export/import : automatiques (sans IA)'));
    console.log(chalk_1.default.gray('    • Compagnon : vérifie, signale les erreurs, propose de l\'aide\n'));
    while (true) {
        const action = await (0, prompts_1.select)({
            message: 'Session liée — action ?',
            choices: [
                { name: '📤  Export vers mon IA (navigateur)', value: 'export' },
                { name: '📥  Import depuis mon IA (presse-papiers)', value: 'import' },
                { name: '🔍  Vérifier une réponse avant import', value: 'validate' },
                { name: '📊  Bilan de la session', value: 'status' },
                { name: '🔴  Terminer la session liée', value: 'end' },
            ],
        });
        if (action === 'end') {
            endLinkedSession();
            (0, ui_1.showInfo)('Session liée terminée.');
            return;
        }
        if (action === 'status') {
            const s = loadLinkedSession();
            if (!s) {
                (0, ui_1.showWarning)('Aucune session active.');
                continue;
            }
            console.log(chalk_1.default.gray(`\n  Dernière action : ${s.lastAction || '—'} (${s.lastActionAt || '—'})`));
            if (s.lastExportFiles != null)
                console.log(chalk_1.default.gray(`  Fichiers scannés (export) : ${s.lastExportFiles}`));
            if (s.lastImportFiles?.length)
                console.log(chalk_1.default.gray(`  Fichiers touchés (import) : ${s.lastImportFiles.join(', ')}`));
            if (s.lastImportErrors?.length) {
                console.log(chalk_1.default.red(`  Erreurs : ${s.lastImportErrors.join('; ')}`));
            }
            console.log('');
            continue;
        }
        if (action === 'validate') {
            const clipboardy = (await Promise.resolve().then(() => __importStar(require('clipboardy')))).default;
            let text = '';
            try {
                text = clipboardy.readSync();
            }
            catch {
                (0, ui_1.showWarning)('Presse-papiers inaccessible.');
                continue;
            }
            const v = validateImportPreview(text);
            if (v.blockCount > 0)
                (0, ui_1.showSuccess)(`${v.blockCount} fichier(s) détecté(s).`);
            for (const w of v.warnings)
                (0, ui_1.showWarning)(w);
            if (v.ok && v.blockCount > 0)
                (0, ui_1.showInfo)('Vous pouvez lancer l\'import en toute confiance.');
            continue;
        }
        if (action === 'export') {
            const { runInteractiveExport } = await Promise.resolve().then(() => __importStar(require('./export-flow')));
            await runInteractiveExport({ bridgeMode: true, skipBanner: true });
            (0, ui_1.showInfo)('Collez le contenu dans votre IA externe.');
            continue;
        }
        if (action === 'import') {
            const { runBridgeImportFromExternal } = await Promise.resolve().then(() => __importStar(require('./bridge-workflow')));
            await runBridgeImportFromExternal({ showDiagram: false });
            continue;
        }
    }
}
