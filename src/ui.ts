/* eslint-disable @typescript-eslint/no-var-requires */
const chalk = require('chalk');
import figlet from 'figlet';
import { getPackageVersion } from './version';

/**
 * Display the beautiful ASCII art banner for Code Caricature
 */
export function showBanner(): void {
    const banner = figlet.textSync('Code Caricature', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
    });

    console.log('');
    console.log(chalk.cyan(banner));
    console.log('');
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
    console.log(chalk.yellow('  🎨  Fais la caricature de ton code, donne-la à ton IA !'));
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
  console.log(chalk.gray(`                       v${getPackageVersion()}`));
    console.log('');
}

/**
 * Show the built-in help guide with colors
 */
export function showHelp(): void {
    console.log('');
    console.log(chalk.cyan.bold('📖  GUIDE D\'UTILISATION'));
    console.log(chalk.gray('  ═══════════════════════════════════════════════════════'));
    console.log('');

    console.log(chalk.white.bold('  🌉 PONT IDE ↔ ChatGPT (usage principal)'));
    console.log(chalk.gray('  1. Export : envoyer le code au navigateur'));
    console.log(chalk.green('       node dist/index.js  → menu « IDE → ChatGPT »'));
    console.log(chalk.gray('  2. Import : appliquer la réponse ChatGPT dans les fichiers'));
    console.log(chalk.green('       node dist/index.js bridge --clipboard'));
    console.log(chalk.gray('  3. Menu complet :'));
    console.log(chalk.green('       node dist/index.js'));
    console.log('');

    // ── Export section
    console.log(chalk.white.bold('  ⚡ EXPORT (Envoyer votre code à l\'IA)'));
    console.log('');

    const exportCmds = [
        { cmd: 'export', desc: 'Copier tout le projet dans le presse-papiers', emoji: '📋' },
        { cmd: 'export -t claude', desc: 'Formater spécialement pour Claude (XML)', emoji: '🤖' },
        { cmd: 'export -o fichier.txt', desc: 'Sauvegarder dans un fichier', emoji: '📁' },
        { cmd: 'export -i ".ts,.js"', desc: 'Filtrer par types de fichiers', emoji: '🔍' },
        { cmd: 'export -s 24', desc: 'Fichiers modifiés depuis 24h', emoji: '🕐' },
        { cmd: 'export -f "src/app.ts"', desc: 'Mettre un fichier en évidence (Focus)', emoji: '🔥' },
        { cmd: 'export -q "Mon bug..."', desc: 'Injecter votre question dans le prompt', emoji: '❓' },
        { cmd: 'export -a', desc: 'Mode Architecture (signatures uniquement)', emoji: '🏗️' },
        { cmd: 'export -g', desc: 'Inclure le graphe de dépendances', emoji: '🔗' },
        { cmd: 'export -c', desc: 'Afficher l\'estimation du coût API ($)', emoji: '💰' },
        { cmd: 'export --no-security', desc: 'Désactiver le filtre de sécurité', emoji: '🔓' },
    ];

    for (const c of exportCmds) {
        console.log(chalk.yellow(`  ${c.emoji}  ${chalk.bold(c.cmd)}`));
        console.log(chalk.gray(`     ${c.desc}`));
        console.log('');
    }

    // ── Import section
    console.log(chalk.gray('  ───────────────────────────────────────────────────────'));
    console.log('');
    console.log(chalk.white.bold('  📥 IMPORT (Récupérer le code corrigé par l\'IA)'));
    console.log('');

    const importCmds = [
        { cmd: 'import --clipboard', desc: 'Lire la réponse IA depuis le presse-papiers', emoji: '📋' },
        { cmd: 'import --file reponse.md', desc: 'Lire la réponse IA depuis un fichier', emoji: '📄' },
        { cmd: 'import --clipboard --dry-run', desc: 'Prévisualiser sans modifier les fichiers', emoji: '👁️' },
    ];

    for (const c of importCmds) {
        console.log(chalk.yellow(`  ${c.emoji}  ${chalk.bold(c.cmd)}`));
        console.log(chalk.gray(`     ${c.desc}`));
        console.log('');
    }

    // ── Combine
    console.log(chalk.gray('  ───────────────────────────────────────────────────────'));
    console.log('');
    console.log(chalk.white.bold('  🔗 COMBINER LES OPTIONS'));
    console.log(chalk.gray('  Exemples de commandes avancées :'));
    console.log(chalk.green('    $ export -t claude -a -g -c'));
    console.log(chalk.gray('      → Architecture + Dépendances + Coût pour Claude'));
    console.log(chalk.green('    $ export -f "src/bug.ts" -q "Corrige ce bug" -o contexte.txt'));
    console.log(chalk.gray('      → Focus + Question + Fichier'));
    console.log('');
    console.log(chalk.gray('  ═══════════════════════════════════════════════════════'));
    console.log('');
}

/**
 * Show a success message with style
 */
export function showSuccess(message: string): void {
    console.log(chalk.green.bold(`\n  ✅  ${message}\n`));
}

/**
 * Show a warning message
 */
export function showWarning(message: string): void {
    console.log(chalk.yellow.bold(`  ⚠️   ${message}`));
}

/**
 * Show an info message
 */
export function showInfo(message: string): void {
    console.log(chalk.cyan(`  ℹ️   ${message}`));
}

/**
 * Show a step in the process
 */
export function showStep(emoji: string, message: string): void {
    console.log(chalk.white(`  ${emoji}  ${message}`));
}

/**
 * Show token count with color coding
 */
export function showTokenCount(tokens: number): void {
    let color = chalk.green;
    let label = 'OK';
    if (tokens > 100000) {
        color = chalk.red;
        label = 'TRÈS ÉLEVÉ';
    } else if (tokens > 50000) {
        color = chalk.yellow;
        label = 'ÉLEVÉ';
    } else if (tokens > 20000) {
        color = chalk.cyan;
        label = 'MOYEN';
    }

    console.log(color(`  📊  Tokens estimés : ${tokens.toLocaleString()} [${label}]`));
    
    if (tokens > 100000) {
        showWarning('Ce volume pourrait dépasser les limites de certaines IA.');
        console.log(chalk.gray('     💡 Astuce : Utilisez -a (architecture) ou --include pour réduire.'));
    }
}
