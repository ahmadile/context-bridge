"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeAnalyzer = void 0;
/**
 * services/code-analyzer.ts
 *
 * Analyse le code actuel et génère des suggestions avec l'IA locale.
 * Demande confirmation avant toute modification.
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prompts_1 = require("@inquirer/prompts");
const chalk_1 = __importDefault(require("chalk"));
const ai_engine_1 = require("../ai-engine");
const open_ai_engine_1 = require("../open-ai-engine");
const ast_parser_1 = require("../ast-parser");
const scanner_1 = require("../scanner");
class CodeAnalyzer {
    targetDir;
    useLocalAI = false;
    openAI = null;
    constructor(targetDir) {
        this.targetDir = targetDir;
    }
    /**
     * Initialize AI engines
     */
    async init() {
        // Try OpenAI first
        this.openAI = new open_ai_engine_1.OpenAIEngine();
        const openAIReady = await this.openAI.init();
        if (!openAIReady) {
            console.log(chalk_1.default.yellow('  ⚠ OpenAI non disponible, basculement vers IA locale'));
            this.useLocalAI = true;
        }
        else {
            console.log(chalk_1.default.green('  ✓ OpenAI connecté pour l\'analyse de code'));
        }
    }
    /**
     * Scan current project code
     */
    scanProjectCode() {
        console.log(chalk_1.default.gray('  🔍 Scan du code en cours...'));
        try {
            const files = (0, scanner_1.scanDirectory)(this.targetDir, this.targetDir);
            const { contents } = (0, scanner_1.readFilesContent)(this.targetDir, files, false);
            // Build signature summary
            const parts = [];
            for (const [filePath, content] of Object.entries(contents)) {
                if (content.startsWith('//'))
                    continue;
                const sigs = (0, ast_parser_1.extractSignatures)(content, filePath);
                if (sigs.length > 0) {
                    parts.push((0, ast_parser_1.formatSignatures)(sigs, filePath));
                }
            }
            return {
                files: files.map(f => path_1.default.relative(this.targetDir, f)),
                signatures: parts.join('\n\n') || '(Aucune signature trouvée)',
            };
        }
        catch (error) {
            console.error(chalk_1.default.red(`  ✗ Erreur lors du scan : ${error.message}`));
            return { files: [], signatures: '(Erreur de scan)' };
        }
    }
    /**
     * Analyze code and get AI suggestions
     */
    async analyzeCode(context) {
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
        console.log(chalk_1.default.blue('  🤖 Analyse du code par l\'IA...'));
        let response;
        if (this.useLocalAI) {
            response = await ai_engine_1.AIEngine.askLocalModel(systemPrompt, userPrompt);
        }
        else if (this.openAI) {
            this.openAI.setSystemPrompt(systemPrompt);
            response = await this.openAI.chat(userPrompt);
        }
        else {
            throw new Error('Aucun moteur IA disponible');
        }
        // Parse JSON response
        try {
            // Extract JSON from response if wrapped in markdown
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
            const result = JSON.parse(jsonStr.trim());
            return result;
        }
        catch (error) {
            console.warn(chalk_1.default.yellow('  ⚠ Impossible de parser la réponse JSON, utilisation du mode texte'));
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
    async suggestCodeCompletion(filePath, currentCode, cursorPosition) {
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
        console.log(chalk_1.default.blue('  💡 Génération de suggestion...'));
        let suggestion;
        if (this.useLocalAI) {
            suggestion = await ai_engine_1.AIEngine.askLocalModel(systemPrompt, userPrompt);
        }
        else if (this.openAI) {
            this.openAI.setSystemPrompt(systemPrompt);
            suggestion = await this.openAI.chat(userPrompt);
        }
        else {
            throw new Error('Aucun moteur IA disponible');
        }
        // Clean up markdown formatting
        const codeMatch = suggestion.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
        return codeMatch ? codeMatch[1].trim() : suggestion.trim();
    }
    /**
     * Apply a code modification with user confirmation
     */
    async applyModification(modification) {
        console.log(chalk_1.default.yellow.bold('\n  📝 Modification proposée :\n'));
        console.log(chalk_1.default.gray(`  Fichier : ${modification.filePath}`));
        console.log(chalk_1.default.gray(`  Raison : ${modification.reason}\n`));
        // Show diff preview
        const diffLines = modification.diff.split('\n');
        for (const line of diffLines.slice(0, 20)) { // Limit to 20 lines
            if (line.startsWith('+')) {
                console.log(chalk_1.default.green(line));
            }
            else if (line.startsWith('-')) {
                console.log(chalk_1.default.red(line));
            }
            else {
                console.log(chalk_1.default.gray(line));
            }
        }
        if (diffLines.length > 20) {
            console.log(chalk_1.default.gray(`  ... (${diffLines.length - 20} lignes supplémentaires)`));
        }
        const confirmed = await (0, prompts_1.confirm)({
            message: '✅  Appliquer cette modification ?',
            default: true,
        });
        if (!confirmed) {
            console.log(chalk_1.default.blue('  ℹ️  Modification annulée'));
            return false;
        }
        // Apply the modification
        const fullPath = path_1.default.resolve(this.targetDir, modification.filePath);
        fs_1.default.writeFileSync(fullPath, modification.newContent, 'utf8');
        console.log(chalk_1.default.green(`  ✓ Fichier mis à jour : ${modification.filePath}`));
        return true;
    }
    /**
     * Interactive mode for code assistance
     */
    async runInteractiveAssistance() {
        console.log(chalk_1.default.cyan.bold('\n  🛠️  Assistant de Code Interactif\n'));
        console.log(chalk_1.default.gray('  Tapez une commande ou décrivez votre besoin:\n'));
        console.log(chalk_1.default.gray('    • "analyse" → Analyser le projet'));
        console.log(chalk_1.default.gray('    • "complete <fichier>" → Suggérer du code'));
        console.log(chalk_1.default.gray('    • "fix <problème>" → Aider à résoudre un problème'));
        console.log(chalk_1.default.gray('    • "quit" → Quitter\n'));
        while (true) {
            const userInput = await (0, prompts_1.input)({ message: chalk_1.default.cyan('  Vous :') });
            if (userInput.toLowerCase() === 'quit' || userInput.toLowerCase() === 'exit') {
                console.log(chalk_1.default.blue('\n  👋 Fin de la session d\'assistance\n'));
                break;
            }
            if (userInput.toLowerCase() === 'analyse') {
                const result = await this.analyzeCode();
                console.log(chalk_1.default.green.bold('\n  📊 Résumé de l\'analyse :\n'));
                console.log(`  ${result.summary}\n`);
                if (result.issues.length > 0) {
                    console.log(chalk_1.default.yellow.bold('  ⚠️  Problèmes détectés :\n'));
                    for (const issue of result.issues) {
                        console.log(chalk_1.default.yellow(`    [${issue.severity.toUpperCase()}] ${issue.file}`));
                        console.log(chalk_1.default.gray(`      ${issue.description}`));
                        if (issue.suggestion) {
                            console.log(chalk_1.default.green(`      → ${issue.suggestion}`));
                        }
                        console.log('');
                    }
                }
                if (result.suggestions.length > 0) {
                    console.log(chalk_1.default.blue.bold('  💡 Suggestions :\n'));
                    for (const sug of result.suggestions) {
                        console.log(chalk_1.default.blue(`    [${sug.type.toUpperCase()}] ${sug.description}`));
                        if (sug.codeSuggestion) {
                            console.log(chalk_1.default.gray(`      \`\`\`\n      ${sug.codeSuggestion.split('\n').join('\n      ')}\n      \`\`\``));
                        }
                        console.log('');
                    }
                }
            }
            else if (userInput.toLowerCase().startsWith('complete')) {
                const parts = userInput.split(' ');
                const filePath = parts[1];
                if (!filePath) {
                    console.log(chalk_1.default.yellow('  ⚠️  Spécifiez un fichier : complete chemin/vers/fichier.ts'));
                    continue;
                }
                const fullPath = path_1.default.resolve(this.targetDir, filePath);
                if (!fs_1.default.existsSync(fullPath)) {
                    console.log(chalk_1.default.red(`  ✗ Fichier non trouvé : ${filePath}`));
                    continue;
                }
                const content = fs_1.default.readFileSync(fullPath, 'utf8');
                const suggestion = await this.suggestCodeCompletion(filePath, content);
                console.log(chalk_1.default.green.bold('\n  💡 Suggestion de code :\n'));
                console.log(chalk_1.default.gray(`  \`\`\`\n  ${suggestion.split('\n').join('\n  ')}\n  \`\`\`\n`));
                // Offer to apply
                if (await (0, prompts_1.confirm)({ message: '✅  Appliquer cette suggestion ?', default: true })) {
                    const modification = {
                        filePath,
                        originalContent: content,
                        newContent: content + '\n' + suggestion,
                        reason: 'Complétion de code suggérée par l\'IA',
                        diff: `--- ${filePath}\n+++ ${filePath}\n@@ -${content.split('\n').length} +1 @@\n+${suggestion}`,
                    };
                    await this.applyModification(modification);
                }
            }
            else {
                // General question/help
                const result = await this.analyzeCode(userInput);
                console.log(chalk_1.default.green.bold('\n  🤖 Réponse de l\'IA :\n'));
                console.log(`  ${result.summary}\n`);
                if (result.suggestions.length > 0) {
                    for (const sug of result.suggestions) {
                        console.log(chalk_1.default.blue(`  ${sug.description}`));
                        if (sug.codeSuggestion) {
                            console.log(chalk_1.default.gray(`    \`\`\`\n    ${sug.codeSuggestion.split('\n').join('\n    ')}\n    \`\`\``));
                        }
                    }
                }
            }
        }
    }
}
exports.CodeAnalyzer = CodeAnalyzer;
