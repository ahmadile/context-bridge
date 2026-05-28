import { Command } from 'commander';
import * as path from 'path';
import { CodeAnalyzer } from '../services/code-analyzer';
import chalk from 'chalk';
import * as readline from 'readline';

export async function runAssistCommand(projectPath: string) {
  console.log(chalk.blue('🤖 Démarrage de l\'ASSISTANT IA...'));
  
  const analyzer = new CodeAnalyzer(projectPath);
  
  // Initialisation obligatoire de l'analyseur IA (OpenAI ou IA locale)
  await analyzer.init();
  
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
      try {
        const result = await analyzer.analyzeCode();
        console.log(chalk.green.bold('\n📊 Résumé de l\'analyse :\n'));
        console.log(`  ${result.summary}\n`);
        if (result.issues && result.issues.length > 0) {
          console.log(chalk.yellow.bold('  ⚠️  Problèmes détectés :\n'));
          for (const issue of result.issues) {
            console.log(chalk.yellow(`    [${issue.severity.toUpperCase()}] ${issue.file}`));
            console.log(chalk.gray(`      ${issue.description}`));
            if (issue.suggestion) {
              console.log(chalk.green(`      → ${issue.suggestion}`));
            }
          }
        }
      } catch (err: any) {
        console.error(chalk.red('  ❌ Échec de l\'analyse globale :'), err.message);
      }
      continue;
    }
    
    if (input.toLowerCase() === 'suggérer') {
      console.log(chalk.blue('💡 Génération de suggestions...'));
      try {
        const result = await analyzer.analyzeCode();
        if (result.suggestions && result.suggestions.length > 0) {
          console.log(chalk.blue.bold('\n💡 Suggestions :\n'));
          for (const sug of result.suggestions) {
            console.log(chalk.blue(`    [${sug.type.toUpperCase()}] ${sug.description}`));
            if (sug.codeSuggestion) {
              console.log(chalk.gray(`      \`\`\`\n      ${sug.codeSuggestion}\n      \`\`\``));
            }
          }
        } else {
          console.log(chalk.gray('  Aucune suggestion spécifique trouvée.'));
        }
      } catch (err: any) {
        console.error(chalk.red('  ❌ Échec de la génération des suggestions :'), err.message);
      }
      continue;
    }

    // Question libre
    console.log(chalk.blue(`🤖 Réflexion sur : "${input}"...`));
    
    if (typeof analyzer.chat === 'function') {
      try {
        const response = await analyzer.chat(input);
        console.log(chalk.white(`\n${response}\n`));
      } catch (err: any) {
        console.error(chalk.red('  ❌ Échec de la réponse de l\'IA :'), err.message);
      }
    } else {
      console.log(chalk.yellow('⚠️  La méthode chat() n\'est pas encore implémentée dans CodeAnalyzer.'));
      console.log(chalk.gray('   Réponse simulée : Je suis en mode démonstration.'));
    }
  }
}

export const assistCommand = new Command('assist')
  .description('🤖 ASSISTANT IA: Débogage et complétion interactive')
  .option('-p, --project <path>', 'Chemin du projet', process.cwd())
  .action(async (options) => {
    await runAssistCommand(options.project);
  });