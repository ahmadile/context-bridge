/**
 * services/code-analyzer.ts
 * 
 * Analyse le code actuel et génère des suggestions avec l'IA locale.
 * Demande confirmation avant toute modification.
 */
import path from 'path';
import fs from 'fs';
import { confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { AIEngine } from '../ai-engine';
import { OpenAIEngine } from '../open-ai-engine';
import { extractSignatures, formatSignatures } from '../ast-parser';
import { scanDirectory, readFilesContent } from '../scanner';

export interface AnalysisResult {
  summary: string;
  issues: Array<{
    file: string;
    line?: number;
    description: string;
    suggestion?: string;
    severity: 'info' | 'warning' | 'error';
  }>;
  suggestions: Array<{
    type: 'refactor' | 'optimize' | 'fix' | 'feature';
    description: string;
    codeSuggestion?: string;
    files?: string[];
  }>;
}

export interface CodeModification {
  filePath: string;
  originalContent: string;
  newContent: string;
  reason: string;
  diff: string;
}

export class CodeAnalyzer {
  private targetDir: string;
  private useLocalAI: boolean = false;
  private openAI: OpenAIEngine | null = null;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  /**
   * Initialize AI engines
   */
  async init(): Promise<void> {
    // Try OpenAI first
    this.openAI = new OpenAIEngine();
    const openAIReady = await this.openAI.init();
    
    if (!openAIReady) {
      console.log(chalk.yellow('  ⚠ OpenAI non disponible, basculement vers IA locale'));
      this.useLocalAI = true;
    } else {
      console.log(chalk.green('  ✓ OpenAI connecté pour l\'analyse de code'));
    }
  }

  /**
   * Scan current project code
   */
  scanProjectCode(): { files: string[]; signatures: string } {
    console.log(chalk.gray('  🔍 Scan du code en cours...'));
    
    try {
      const files = scanDirectory(this.targetDir, this.targetDir);
      const { contents } = readFilesContent(this.targetDir, files, false);

      // Build signature summary
      const parts: string[] = [];
      for (const [filePath, content] of Object.entries(contents)) {
        if (content.startsWith('//')) continue;
        const sigs = extractSignatures(content, filePath);
        if (sigs.length > 0) {
          parts.push(formatSignatures(sigs, filePath));
        }
      }

      return {
        files: files.map(f => path.relative(this.targetDir, f)),
        signatures: parts.join('\n\n') || '(Aucune signature trouvée)',
      };
    } catch (error) {
      console.error(chalk.red(`  ✗ Erreur lors du scan : ${(error as Error).message}`));
      return { files: [], signatures: '(Erreur de scan)' };
    }
  }

  /**
   * Analyze code and get AI suggestions
   */
  async analyzeCode(context?: string): Promise<AnalysisResult> {
    const codeScan = this.scanProjectCode();
    
    const systemPrompt = `Tu es un expert en analyse de code et en programmation.
Ta tâche est d'analyser le code fourni et de fournir des recommandations utiles.

RÈGLES :
1. Sois concis et direct dans tes analyses
2. Identifie les problèmes potentiels (bugs, performances, maintenabilité)
3. Propose des améliorations concrètes avec des exemples de code si pertinent
4. Priorise les suggestions par ordre d'importance
5. Réponds TOUJOURS en français

Format de réponse attendu (JSON strict) :
{
  "summary": "Résumé bref de l'état du code",
  "issues": [
    {
      "file": "chemin/vers/fichier.ts",
      "line": 42,
      "description": "Description du problème",
      "suggestion": "Comment corriger",
      "severity": "warning"
    }
  ],
  "suggestions": [
    {
      "type": "refactor",
      "description": "Description de la suggestion",
      "codeSuggestion": "// exemple de code optionnel",
      "files": ["fichiers concernés"]
    }
  ]
}`;

    const userPrompt = `Voici la structure et les signatures du code à analyser :

${codeScan.signatures}

${context ? `Contexte supplémentaire : ${context}\n` : ''}

Analyse ce code et fournis tes recommandations sous forme de JSON valide.`;

    console.log(chalk.blue('  🤖 Analyse du code par l\'IA...'));

    let response: string;
    if (this.useLocalAI) {
      response = await AIEngine.askLocalModel(systemPrompt, userPrompt);
    } else if (this.openAI) {
      this.openAI.setSystemPrompt(systemPrompt);
      response = await this.openAI.chat(userPrompt);
    } else {
      throw new Error('Aucun moteur IA disponible');
    }

    // Parse JSON response
    try {
      // Extract JSON from response if wrapped in markdown
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      
      const result: AnalysisResult = JSON.parse(jsonStr.trim());
      return result;
    } catch (error) {
      console.warn(chalk.yellow('  ⚠ Impossible de parser la réponse JSON, utilisation du mode texte'));
      return {
        summary: 'Analyse effectuée',
        issues: [],
        suggestions: [{
          type: 'refactor',
          description: response,
        }],
      };
    }
  }

  /**
   * Generate code completion suggestion for a specific file
   */
  async suggestCodeCompletion(filePath: string, currentCode: string, cursorPosition?: number): Promise<string> {
    const systemPrompt = `Tu es un assistant de complétion de code intelligent.
Ta tâche est de suggérer la suite logique du code en fonction du contexte.

RÈGLES :
1. Analyse le code existant et le style utilisé
2. Suggère uniquement la suite logique (pas besoin de répéter le code existant)
3. Respecte les conventions du langage et du projet
4. Sois concis : suggère seulement quelques lignes pertinentes
5. Réponds UNIQUEMENT avec le code suggéré, sans explications`;

    const context = cursorPosition 
      ? `Code avant le curseur :\n${currentCode.slice(0, cursorPosition)}\n\nCode après le curseur :\n${currentCode.slice(cursorPosition)}`
      : `Code actuel :\n${currentCode}`;

    const userPrompt = `Fichier : ${filePath}\n\n${context}\n\nSuggère la suite logique du code ou complète les parties manquantes.`;

    console.log(chalk.blue('  💡 Génération de suggestion...'));

    let suggestion: string;
    if (this.useLocalAI) {
      suggestion = await AIEngine.askLocalModel(systemPrompt, userPrompt);
    } else if (this.openAI) {
      this.openAI.setSystemPrompt(systemPrompt);
      suggestion = await this.openAI.chat(userPrompt);
    } else {
      throw new Error('Aucun moteur IA disponible');
    }

    // Clean up markdown formatting
    const codeMatch = suggestion.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
    return codeMatch ? codeMatch[1].trim() : suggestion.trim();
  }

  /**
   * Apply a code modification with user confirmation
   */
  async applyModification(modification: CodeModification): Promise<boolean> {
    console.log(chalk.yellow.bold('\n  📝 Modification proposée :\n'));
    console.log(chalk.gray(`  Fichier : ${modification.filePath}`));
    console.log(chalk.gray(`  Raison : ${modification.reason}\n`));
    
    // Show diff preview
    const diffLines = modification.diff.split('\n');
    for (const line of diffLines.slice(0, 20)) { // Limit to 20 lines
      if (line.startsWith('+')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-')) {
        console.log(chalk.red(line));
      } else {
        console.log(chalk.gray(line));
      }
    }
    if (diffLines.length > 20) {
      console.log(chalk.gray(`  ... (${diffLines.length - 20} lignes supplémentaires)`));
    }

    const confirmed = await confirm({
      message: '✅  Appliquer cette modification ?',
      default: true,
    });

    if (!confirmed) {
      console.log(chalk.blue('  ℹ️  Modification annulée'));
      return false;
    }

    // Apply the modification
    const fullPath = path.resolve(this.targetDir, modification.filePath);
    fs.writeFileSync(fullPath, modification.newContent, 'utf8');
    console.log(chalk.green(`  ✓ Fichier mis à jour : ${modification.filePath}`));
    return true;
  }

  /**
   * Interactive mode for code assistance
   */
  async runInteractiveAssistance(): Promise<void> {
    console.log(chalk.cyan.bold('\n  🛠️  Assistant de Code Interactif\n'));
    console.log(chalk.gray('  Tapez une commande ou décrivez votre besoin:\n'));
    console.log(chalk.gray('    • "analyse" → Analyser le projet'));
    console.log(chalk.gray('    • "complete <fichier>" → Suggérer du code'));
    console.log(chalk.gray('    • "fix <problème>" → Aider à résoudre un problème'));
    console.log(chalk.gray('    • "quit" → Quitter\n'));

    while (true) {
      const userInput = await input({ message: chalk.cyan('  Vous :') });

      if (userInput.toLowerCase() === 'quit' || userInput.toLowerCase() === 'exit') {
        console.log(chalk.blue('\n  👋 Fin de la session d\'assistance\n'));
        break;
      }

      if (userInput.toLowerCase() === 'analyse') {
        const result = await this.analyzeCode();
        console.log(chalk.green.bold('\n  📊 Résumé de l\'analyse :\n'));
        console.log(`  ${result.summary}\n`);

        if (result.issues.length > 0) {
          console.log(chalk.yellow.bold('  ⚠️  Problèmes détectés :\n'));
          for (const issue of result.issues) {
            console.log(chalk.yellow(`    [${issue.severity.toUpperCase()}] ${issue.file}`));
            console.log(chalk.gray(`      ${issue.description}`));
            if (issue.suggestion) {
              console.log(chalk.green(`      → ${issue.suggestion}`));
            }
            console.log('');
          }
        }

        if (result.suggestions.length > 0) {
          console.log(chalk.blue.bold('  💡 Suggestions :\n'));
          for (const sug of result.suggestions) {
            console.log(chalk.blue(`    [${sug.type.toUpperCase()}] ${sug.description}`));
            if (sug.codeSuggestion) {
              console.log(chalk.gray(`      \`\`\`\n      ${sug.codeSuggestion.split('\n').join('\n      ')}\n      \`\`\``));
            }
            console.log('');
          }
        }
      } else if (userInput.toLowerCase().startsWith('complete')) {
        const parts = userInput.split(' ');
        const filePath = parts[1];
        
        if (!filePath) {
          console.log(chalk.yellow('  ⚠️  Spécifiez un fichier : complete chemin/vers/fichier.ts'));
          continue;
        }

        const fullPath = path.resolve(this.targetDir, filePath);
        if (!fs.existsSync(fullPath)) {
          console.log(chalk.red(`  ✗ Fichier non trouvé : ${filePath}`));
          continue;
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        const suggestion = await this.suggestCodeCompletion(filePath, content);

        console.log(chalk.green.bold('\n  💡 Suggestion de code :\n'));
        console.log(chalk.gray(`  \`\`\`\n  ${suggestion.split('\n').join('\n  ')}\n  \`\`\`\n`));

        // Offer to apply
        if (await confirm({ message: '✅  Appliquer cette suggestion ?', default: true })) {
          const modification: CodeModification = {
            filePath,
            originalContent: content,
            newContent: content + '\n' + suggestion,
            reason: 'Complétion de code suggérée par l\'IA',
            diff: `--- ${filePath}\n+++ ${filePath}\n@@ -${content.split('\n').length} +1 @@\n+${suggestion}`,
          };
          await this.applyModification(modification);
        }
      } else {
        // General question/help
        const result = await this.analyzeCode(userInput);
        console.log(chalk.green.bold('\n  🤖 Réponse de l\'IA :\n'));
        console.log(`  ${result.summary}\n`);
        
        if (result.suggestions.length > 0) {
          for (const sug of result.suggestions) {
            console.log(chalk.blue(`  ${sug.description}`));
            if (sug.codeSuggestion) {
              console.log(chalk.gray(`    \`\`\`\n    ${sug.codeSuggestion.split('\n').join('\n    ')}\n    \`\`\``));
            }
          }
        }
      }
    }
  }

  /**
   * Chat with AI about code (for assist command)
   */
  async chat(message: string): Promise<string> {
    const result = await this.analyzeCode(message);
    
    let response = result.summary;
    if (result.suggestions.length > 0) {
      response += '\n\nSuggestions :\n';
      for (const sug of result.suggestions) {
        response += `- ${sug.description}\n`;
        if (sug.codeSuggestion) {
          response += `  \`\`\`\n  ${sug.codeSuggestion}\n  \`\`\`\n`;
        }
      }
    }
    
    return response;
  }

  /**
   * Load context from transcript file (for watch command)
   */
  async loadContext(transcriptPath: string): Promise<void> {
    console.log(chalk.gray(`  📚 Chargement du contexte depuis : ${transcriptPath}`));
    
    if (!fs.existsSync(transcriptPath)) {
      console.log(chalk.yellow(`  ⚠ Fichier de transcription non trouvé : ${transcriptPath}`));
      return;
    }

    const content = fs.readFileSync(transcriptPath, 'utf8');
    console.log(chalk.green(`  ✓ Contexte chargé (${content.length} caractères)`));
  }

  /**
   * Analyze code changes (for watch command)
   */
  async analyzeChange(filePath: string, changes: { type: string; line?: number; content?: string }): Promise<{ explanation: string; code: string } | null> {
    console.log(chalk.gray('  🔍 Analyse du changement...'));
    
    const systemPrompt = `Tu es un expert en revue de code en temps réel.
Ta tâche est d'analyser les changements de code et de fournir des suggestions immédiates.

RÈGLES :
1. Sois concis et direct
2. Identifie les problèmes potentiels immédiatement
3. Propose des corrections si nécessaire
4. Réponds TOUJOURS en français

Format de réponse attendu (JSON strict) :
{
  "explanation": "Explication brève du changement et des problèmes potentiels",
  "code": "// suggestion de code optionnelle"
}`;

    const userPrompt = `Fichier modifié : ${filePath}
Type de changement : ${changes.type}
${changes.line ? `Ligne : ${changes.line}` : ''}
${changes.content ? `Contenu : ${changes.content}` : ''}

Analyse ce changement et fournis tes recommandations.`;

    let response: string;
    if (this.useLocalAI) {
      response = await AIEngine.askLocalModel(systemPrompt, userPrompt);
    } else if (this.openAI) {
      this.openAI.setSystemPrompt(systemPrompt);
      response = await this.openAI.chat(userPrompt);
    } else {
      return {
        explanation: `Changement détecté : ${changes.type} dans ${filePath}`,
        code: '// IA non disponible pour analyse détaillée'
      };
    }

    // Parse JSON response
    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      
      const result: { explanation: string; code: string } = JSON.parse(jsonStr.trim());
      return result;
    } catch (error) {
      return {
        explanation: response,
        code: '// Aucune suggestion de code spécifique'
      };
    }
  }
}
