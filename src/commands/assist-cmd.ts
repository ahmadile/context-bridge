import { Command } from 'commander';
import * as path from 'path';
import { CodeAnalyzer } from '../services/code-analyzer';
import chalk from 'chalk';
import * as readline from 'readline';



export const assistCommand = new Command('assist')
  .description('🤖 ASSISTANT IA: Débogage et complétion interactive')
  .option('-p, --project <path>', 'Chemin du projet', process.cwd())
  .action(async (options) => {
    console.log(chalk.blue('🤖 Démarrage de l\'ASSISTANT IA...'));
    
    // Correction 1: Passer le chemin du projet au constructeur
    const analyzer = new CodeAnalyzer(options.project);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askQuestion = (query: string): Promise<string> => {
      return new Promise(resolve => rl.question(query, resolve));
    };

    console.log(chalk.green('\n✅ Prêt ! Tapez "analyser", "suggérer" ou "quit".\n'));

    while (true) {
      const input = await askQuestion(chalk.cyan('Vous > '));
      
      if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('👋 Assistant fermé.'));
        rl.close();
        break;
      }
      
      if (input.toLowerCase() === 'analyser') {
        console.log(chalk.blue('🔍 Analyse globale du projet...'));
        // Logique d'analyse globale
        console.log(chalk.green('✅ Analyse terminée (exemple).'));
        continue;
      }
      if (input.toLowerCase() === 'suggérer') {
        console.log(chalk.blue('💡 Génération de suggestions...'));
        // Logique de suggestion
        console.log(chalk.green('✅ Suggestions générées (exemple).'));
        continue;
      }

      // Question libre
      console.log(chalk.blue(`🤖 Réflexion sur : "${input}"...`));
      
      // Correction 2: Vérifier si la méthode chat existe, sinon afficher un message
      if (typeof analyzer.chat === 'function') {
        const response = await analyzer.chat(input);
        console.log(chalk.white(response));
      } else {
        console.log(chalk.yellow('⚠️  La méthode chat() n\'est pas encore implémentée dans CodeAnalyzer.'));
        console.log(chalk.gray('   Réponse simulée : Je suis en mode démonstration.'));
      }
    }
  });