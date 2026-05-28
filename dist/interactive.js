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
exports.runInteractiveMode = runInteractiveMode;
/* eslint-disable @typescript-eslint/no-var-requires */
const chalk = require('chalk');
const prompts_1 = require("@inquirer/prompts");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const clipboardy_1 = __importDefault(require("clipboardy"));
const ui_1 = require("./ui");
const bridge_workflow_1 = require("./bridge-workflow");
const companion_session_1 = require("./companion-session");
const export_flow_1 = require("./export-flow");
const transcript_utils_1 = require("./transcript-utils");
let interactiveSessionActive = false;
/**
 * Menu principal — une seule boucle contrôlée, option Quitter explicite.
 */
async function runInteractiveMode() {
    if (interactiveSessionActive) {
        return;
    }
    interactiveSessionActive = true;
    try {
        (0, ui_1.showBanner)();
        console.log(chalk.blue(`  📁  ${process.cwd()}\n`));
        console.log(chalk.gray('  Pont : IDE ↔ votre IA externe (export / import de fichiers)\n'));
        let running = true;
        while (running) {
            const mainAction = await (0, prompts_1.select)({
                message: 'Menu principal',
                choices: [
                    {
                        name: '1. Importer la réponse de mon IA → fichiers du projet',
                        value: 'import',
                    },
                    {
                        name: '2. Exporter mon projet → presse-papiers (pour mon IA)',
                        value: 'export',
                    },
                    {
                        name: '3. Session accompagnée (export + import + vérifications)',
                        value: 'companion',
                    },
                    {
                        name: '4. Copier le format de réponse pour mon IA',
                        value: 'instructions',
                    },
                    {
                        name: '5. Autres (tutoriel, discussion, diagnostic, aide)',
                        value: 'more',
                    },
                    {
                        name: '0. Quitter',
                        value: 'quit',
                    },
                ],
            });
            switch (mainAction) {
                case 'import':
                    await (0, bridge_workflow_1.runBridgeImportFromExternal)({ showDiagram: false });
                    break;
                case 'export':
                    await (0, export_flow_1.runInteractiveExport)({ bridgeMode: true, skipBanner: true });
                    break;
                case 'companion':
                    await (0, companion_session_1.runCompanionLoop)();
                    break;
                case 'instructions':
                    (0, bridge_workflow_1.copyExternalAiInstructions)();
                    break;
                case 'more':
                    await runMoreMenu();
                    break;
                case 'quit':
                    running = false;
                    console.log(chalk.blue('\n  Au revoir.\n'));
                    break;
            }
        }
    }
    finally {
        interactiveSessionActive = false;
    }
}
async function runMoreMenu() {
    const action = await (0, prompts_1.select)({
        message: 'Autres options',
        choices: [
            { name: 'Tutoriel (transcription vidéo)', value: 'tutoriel' },
            { name: 'Discussion IA (terminal)', value: 'chat' },
            { name: 'Diagnostic', value: 'doctor' },
            { name: 'Aide', value: 'help' },
            { name: '← Retour au menu principal', value: 'back' },
        ],
    });
    if (action === 'back')
        return;
    if (action === 'tutoriel') {
        await runInteractiveTutoriel();
    }
    else if (action === 'chat') {
        const { runLocalChatMode } = await Promise.resolve().then(() => __importStar(require('./attitudes/chat-local')));
        await runLocalChatMode();
    }
    else if (action === 'doctor') {
        const { runDoctor } = await Promise.resolve().then(() => __importStar(require('./doctor')));
        await runDoctor();
    }
    else if (action === 'help') {
        const { showHelp } = await Promise.resolve().then(() => __importStar(require('./ui')));
        showHelp();
    }
}
async function runInteractiveTutoriel() {
    const source = await (0, prompts_1.select)({
        message: 'Transcription :',
        choices: [
            { name: 'Presse-papiers', value: 'clipboard' },
            { name: 'Fichier', value: 'file' },
        ],
    });
    let transcript = '';
    if (source === 'clipboard') {
        try {
            transcript = clipboardy_1.default.readSync();
            if (!transcript.trim()) {
                (0, ui_1.showWarning)('Presse-papiers vide.');
                return;
            }
        }
        catch {
            (0, ui_1.showWarning)('Presse-papiers inaccessible.');
            return;
        }
    }
    else {
        const p = await (0, prompts_1.input)({ message: 'Fichier :', default: 'transcript.txt' });
        const full = path_1.default.resolve(process.cwd(), p.trim());
        if (!fs_1.default.existsSync(full)) {
            (0, ui_1.showWarning)('Fichier introuvable.');
            return;
        }
        transcript = fs_1.default.readFileSync(full, 'utf8');
    }
    (0, ui_1.showStep)('📄', `${transcript.length.toLocaleString()} caractères`);
    const segments = (0, transcript_utils_1.segmentTranscript)(transcript);
    let workingTranscript = transcript;
    if (segments.length > 1) {
        const suggested = (0, transcript_utils_1.suggestBestSegmentIndex)(segments);
        const pickMode = await (0, prompts_1.select)({
            message: 'Transcription longue — par où commencer ?',
            choices: [
                { name: `Recommandé (partie ${suggested + 1})`, value: 'auto' },
                { name: 'Choisir une partie', value: 'manual' },
                { name: 'Tout (IA cloud conseillée)', value: 'full' },
            ],
        });
        if (pickMode === 'auto') {
            workingTranscript = (0, transcript_utils_1.buildTranscriptFromSegment)(segments, suggested);
            (0, ui_1.showInfo)(`Partie ${suggested + 1} : ${segments[suggested].title}`);
        }
        else if (pickMode === 'manual') {
            const chosen = await (0, prompts_1.select)({
                message: 'Partie :',
                choices: segments.map((s) => ({
                    name: `[${s.index + 1}] ${s.title} (${s.charCount} car.)`,
                    value: s.index,
                })),
            });
            workingTranscript = (0, transcript_utils_1.buildTranscriptFromSegment)(segments, chosen);
        }
    }
    const tempPath = path_1.default.resolve(process.cwd(), '.temp-transcript-segment.txt');
    fs_1.default.writeFileSync(tempPath, workingTranscript, 'utf8');
    const { runTutorielAttitude } = await Promise.resolve().then(() => __importStar(require('./attitudes/tutoriel')));
    await runTutorielAttitude(tempPath);
    try {
        fs_1.default.unlinkSync(tempPath);
    }
    catch { }
}
