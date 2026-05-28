/**
 * Diagnostic rapide : vérifie build, MCP, dépendances et configuration IA.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { getPackageVersion } from './version';

export async function runDoctor(): Promise<void> {
  console.log(chalk.cyan.bold('\n  🩺 Diagnostic code-caricature\n'));
  console.log(chalk.gray(`  Version : ${getPackageVersion()}`));
  console.log(chalk.gray(`  CWD     : ${process.cwd()}\n`));

  let ok = 0;
  let warn = 0;
  let fail = 0;

  const check = (label: string, status: 'ok' | 'warn' | 'fail', detail: string) => {
    const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
    const color = status === 'ok' ? chalk.green : status === 'warn' ? chalk.yellow : chalk.red;
    console.log(color(`  ${icon}  ${label}`));
    console.log(chalk.gray(`      ${detail}`));
    if (status === 'ok') ok++;
    else if (status === 'warn') warn++;
    else fail++;
  };

  // Build
  const distIndex = path.resolve(__dirname, 'index.js');
  const testScript = path.resolve(__dirname, '..', 'scripts', 'test-mcp.js');
  if (fs.existsSync(distIndex)) {
    check('Build (dist/)', 'ok', distIndex);
  } else {
    check('Build (dist/)', 'fail', 'Exécutez : npm run build');
  }

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    check('Grande IA (OpenAI)', 'ok', 'OPENAI_API_KEY détectée — tutoriel/chat cloud possible');
  } else {
    check(
      'Grande IA (OpenAI)',
      'warn',
      'Pas de OPENAI_API_KEY — seul le mode local (Qwen) sera utilisé en secours'
    );
  }

  // Local model
  let ollamaOk = false;
  let ollamaModels: string[] = [];
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (res.status === 200) {
      const data = await res.json() as any;
      ollamaOk = true;
      if (data.models && data.models.length > 0) {
        ollamaModels = data.models.map((m: any) => m.name);
      }
    }
  } catch (e) {}

  const modelPath = path.join(
    os.homedir(),
    '.code-caricature',
    'models',
    'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf'
  );

  if (ollamaOk) {
    const modelsStr = ollamaModels.length > 0 ? ollamaModels.join(', ') : 'aucun modèle détecté';
    check('IA locale (Ollama)', 'ok', `Ollama est actif sur http://localhost:11434 (Modèles : ${modelsStr})`);
  } else if (fs.existsSync(modelPath)) {
    const mb = (fs.statSync(modelPath).size / 1024 / 1024).toFixed(0);
    check('IA locale (Qwen GGUF)', 'ok', `Modèle présent (${mb} Mo) - Prêt pour fallback node-llama-cpp`);
  } else {
    check(
      'IA locale (Ollama / Qwen GGUF)',
      'warn',
      `Aucun service local détecté. Lancez Ollama (ollama run qwen2.5-coder:1.5b) ou installez le modèle GGUF.`
    );
  }

  // MCP test
  if (fs.existsSync(testScript)) {
    console.log(chalk.gray('\n  Test MCP en cours…\n'));
    const result = spawnSync('node', [testScript], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
    });
    if (result.status === 0) {
      check('Serveur MCP', 'ok', '3 outils répondent (get_project_context, apply_code_changes, get_dependency_graph)');
    } else {
      check('Serveur MCP', 'fail', (result.stderr || result.stdout || 'Échec du test').slice(0, 200));
    }
  } else {
    check('Serveur MCP', 'warn', 'Script scripts/test-mcp.js introuvable');
  }

  console.log(chalk.gray('\n  ─────────────────────────────────────────'));
  console.log(
    chalk.white(
      `  Résultat : ${chalk.green(ok + ' OK')}  ${chalk.yellow(warn + ' avert.')}  ${chalk.red(fail + ' échec(s)')}`
    )
  );
  console.log(chalk.gray('  ─────────────────────────────────────────\n'));

  if (fail > 0) process.exitCode = 1;
}
