import { Command } from "commander";
import * as path from 'path';
import { FileWatcher } from '../services/file-watcher';
import { CodeAnalyzer } from '../services/code-analyzer';
import chalk from 'chalk';

export async function runWatchCommand(projectPath: string, transcriptPath?: string) {
  console.log(chalk.blue('🔴 Démarrage du mode LIVE CODING...'));
  console.log(`📁 Projet : ${path.resolve(projectPath)}`);
  
  if (transcriptPath) {
    console.log(`📜 Transcription chargée : ${transcriptPath}`);
  }

  const watcher = new FileWatcher({ cwd: projectPath });
  const analyzer = new CodeAnalyzer(projectPath);
  
  // Initialisation obligatoire de l'analyseur IA (OpenAI ou IA locale)
  await analyzer.init();

  // Charger le contexte si transcription fournie
  if (transcriptPath) {
    if (typeof analyzer.loadContext === 'function') {
      await analyzer.loadContext(transcriptPath);
    } else {
      console.log(chalk.yellow('⚠️  La méthode loadContext() n\'est pas encore implémentée.'));
    }
  }
  console.log(chalk.green('✅ Surveillance active. Modifiez vos fichiers pour voir les suggestions.'));
  console.log(chalk.yellow('⚠️  Appuyez sur Ctrl+C pour arrêter.\n'));

  // Événement correct émis par FileWatcher : 'file-change'
  watcher.on('file-change', async (event) => {
    console.log(chalk.cyan(`\n📝 Changement détecté : ${path.relative(projectPath, event.filePath)}`));
    try {
      if (typeof analyzer.analyzeChange === 'function') {
        const suggestion = await analyzer.analyzeChange(event.filePath, {
          type: event.type,
          content: event.content
        });
        
        if (suggestion) {
          console.log(chalk.bgBlue.white('\n💡 SUGGESTION IA :\n'));
          console.log(suggestion.explanation);
          if (suggestion.code) {
            console.log(chalk.gray('---'));
            console.log(suggestion.code);
          }
        }
      } else {
        console.log(chalk.yellow('⚠️  La méthode analyzeChange() n\'est pas encore implémentée.'));
        console.log(chalk.gray('   Fonctionnalité en cours de développement...'));
      }
    } catch (error) {
      console.error(chalk.red('Erreur d\'analyse :'), error);
    }
  });

  watcher.start();
}

export const watchCommand = new Command('watch')
  .description('🔴 LIVE CODING: Surveillance en temps réel et suggestions IA')
  .option('-p, --project <path>', 'Chemin du projet à surveiller', process.cwd())
  .option('-t, --transcript <path>', 'Chemin de la transcription du tutoriel (optionnel)')
  .action(async (options) => {
    await runWatchCommand(options.project, options.transcript);
  });