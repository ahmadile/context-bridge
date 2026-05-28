import { Command } from "commander";
import * as path from 'path';
import { FileWatcher } from '../services/file-watcher';
import { CodeAnalyzer } from '../services/code-analyzer';
import chalk from 'chalk';

export const watchCommand = new Command('watch')
  .description('🔴 LIVE CODING: Surveillance en temps réel et suggestions IA')
  .option('-p, --project <path>', 'Chemin du projet à surveiller', process.cwd())
  .option('-t, --transcript <path>', 'Chemin de la transcription du tutoriel (optionnel)')
  .action(async (options) => {
    console.log(chalk.blue('🔴 Démarrage du mode LIVE CODING...'));
    console.log(`📁 Projet : ${path.resolve(options.project)}`);
    
    if (options.transcript) {
      console.log(`📜 Transcription chargée : ${options.transcript}`);
    }

    const watcher = new FileWatcher(options.project);
    
    // Correction 1: Passer le chemin du projet au constructeur
    const analyzer = new CodeAnalyzer(options.project);

    // Charger le contexte si transcription fournie
    if (options.transcript) {
      // Correction 2: Utiliser loadContext avec minuscule si c'est le nom correct
      if (typeof analyzer.loadContext === 'function') {
        await analyzer.loadContext(options.transcript);
      } else {
        console.log(chalk.yellow('⚠️  La méthode loadContext() n\'est pas encore implémentée.'));
      }
    }
    console.log(chalk.green('✅ Surveillance active. Modifiez vos fichiers pour voir les suggestions.'));
    console.log(chalk.yellow('⚠️  Appuyez sur Ctrl+C pour arrêter.\n'));

    watcher.on('fileChanged', async (filePath, changes) => {
      console.log(chalk.cyan(`\n📝 Changement détecté : ${path.relative(options.project, filePath)}`));
      try {
        // Correction 3: Vérifier si analyzeChange existe
        if (typeof analyzer.analyzeChange === 'function') {
          const suggestion = await analyzer.analyzeChange(filePath, changes);
          
          if (suggestion) {
            console.log(chalk.bgBlue.white('\n💡 SUGGESTION IA :\n'));
            console.log(suggestion.explanation);
            console.log(chalk.gray('---'));
            console.log(suggestion.code);
            
            console.log(chalk.yellow('\n❓ Voulez-vous appliquer cette modification ? (Oui/Non)'));
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
  });