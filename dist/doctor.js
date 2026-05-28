"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoctor = runDoctor;
/**
 * Diagnostic rapide : vérifie build, MCP, dépendances et configuration IA.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const chalk_1 = __importDefault(require("chalk"));
const version_1 = require("./version");
async function runDoctor() {
    console.log(chalk_1.default.cyan.bold('\n  🩺 Diagnostic code-caricature\n'));
    console.log(chalk_1.default.gray(`  Version : ${(0, version_1.getPackageVersion)()}`));
    console.log(chalk_1.default.gray(`  CWD     : ${process.cwd()}\n`));
    let ok = 0;
    let warn = 0;
    let fail = 0;
    const check = (label, status, detail) => {
        const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
        const color = status === 'ok' ? chalk_1.default.green : status === 'warn' ? chalk_1.default.yellow : chalk_1.default.red;
        console.log(color(`  ${icon}  ${label}`));
        console.log(chalk_1.default.gray(`      ${detail}`));
        if (status === 'ok')
            ok++;
        else if (status === 'warn')
            warn++;
        else
            fail++;
    };
    // Build
    const distIndex = path_1.default.resolve(__dirname, 'index.js');
    const testScript = path_1.default.resolve(__dirname, '..', 'scripts', 'test-mcp.js');
    if (fs_1.default.existsSync(distIndex)) {
        check('Build (dist/)', 'ok', distIndex);
    }
    else {
        check('Build (dist/)', 'fail', 'Exécutez : npm run build');
    }
    // OpenAI
    if (process.env.OPENAI_API_KEY) {
        check('Grande IA (OpenAI)', 'ok', 'OPENAI_API_KEY détectée — tutoriel/chat cloud possible');
    }
    else {
        check('Grande IA (OpenAI)', 'warn', 'Pas de OPENAI_API_KEY — seul le mode local (Qwen) sera utilisé en secours');
    }
    // Local model
    const modelPath = path_1.default.join(os_1.default.homedir(), '.code-caricature', 'models', 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf');
    if (fs_1.default.existsSync(modelPath)) {
        const mb = (fs_1.default.statSync(modelPath).size / 1024 / 1024).toFixed(0);
        check('IA locale (Qwen)', 'ok', `Modèle présent (${mb} Mo)`);
    }
    else {
        check('IA locale (Qwen)', 'warn', `Modèle absent — sera téléchargé (~1,1 Go) au premier usage : ${modelPath}`);
    }
    // MCP test
    if (fs_1.default.existsSync(testScript)) {
        console.log(chalk_1.default.gray('\n  Test MCP en cours…\n'));
        const result = (0, child_process_1.spawnSync)('node', [testScript], {
            cwd: path_1.default.resolve(__dirname, '..'),
            encoding: 'utf8',
            timeout: 30000,
        });
        if (result.status === 0) {
            check('Serveur MCP', 'ok', '3 outils répondent (get_project_context, apply_code_changes, get_dependency_graph)');
        }
        else {
            check('Serveur MCP', 'fail', (result.stderr || result.stdout || 'Échec du test').slice(0, 200));
        }
    }
    else {
        check('Serveur MCP', 'warn', 'Script scripts/test-mcp.js introuvable');
    }
    console.log(chalk_1.default.gray('\n  ─────────────────────────────────────────'));
    console.log(chalk_1.default.white(`  Résultat : ${chalk_1.default.green(ok + ' OK')}  ${chalk_1.default.yellow(warn + ' avert.')}  ${chalk_1.default.red(fail + ' échec(s)')}`));
    console.log(chalk_1.default.gray('  ─────────────────────────────────────────\n'));
    if (fail > 0)
        process.exitCode = 1;
}
