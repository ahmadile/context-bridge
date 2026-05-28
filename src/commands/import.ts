/**
 * commands/import.ts
 * Commande import - Importer le code corrigé par l'IA dans votre projet
 */
import { parseAIResponse, generateDiff, applyCodeBlocks } from '../importer';
import { showBanner, showStep, showSuccess, showWarning, showInfo } from '../ui';
import clipboardy from 'clipboardy';
import fs from 'fs';
import path from 'path';

export interface ImportOptions {
    file?: string;
    clipboard?: boolean;
    dryRun?: boolean;
}

export async function runImport(options: ImportOptions): Promise<void> {
    showBanner();
    const targetDir = process.cwd();

    let responseText: string;

    if (options.file) {
        const filePath = path.resolve(targetDir, options.file);
        if (!fs.existsSync(filePath)) {
            showWarning(`Fichier non trouvé : ${filePath}`);
            return;
        }
        responseText = fs.readFileSync(filePath, 'utf8');
        showStep('📄', `Lecture de la réponse IA depuis : ${filePath}`);
    } else if (options.clipboard) {
        try {
            responseText = clipboardy.readSync();
            showStep('📋', 'Lecture de la réponse IA depuis le presse-papiers');
        } catch (e) {
            showWarning('Impossible de lire le presse-papiers.');
            return;
        }
    } else {
        showWarning('Utilisez --file ou --clipboard pour spécifier la source.');
        showInfo('Exemple : code-caricature import --clipboard');
        showInfo('Exemple : code-caricature import --file reponse-ia.md');
        return;
    }

    // Parse the AI response
    showStep('🔍', 'Analyse de la réponse IA...');
    const blocks = parseAIResponse(responseText);

    if (blocks.length === 0) {
        showWarning('Aucun bloc de code avec chemin de fichier trouvé dans la réponse.');
        showInfo('Astuce : L\'IA doit inclure le chemin du fichier dans ses blocs de code.');
        showInfo('Formats reconnus :');
        showInfo('  ```ts src/monFichier.ts');
        showInfo('  ### `src/monFichier.ts`');
        showInfo('  <file path="src/monFichier.ts">');
        return;
    }

    showSuccess(`${blocks.length} bloc(s) de code trouvé(s) :`);

    // Show diff for each block
    for (const block of blocks) {
        const fullPath = path.resolve(targetDir, block.filePath);
        if (fs.existsSync(fullPath)) {
            const oldContent = fs.readFileSync(fullPath, 'utf8');
            console.log(generateDiff(oldContent, block.content, block.filePath));
        } else {
            showInfo(`📝 Nouveau fichier : ${block.filePath} (${block.content.split('\n').length} lignes)`);
        }
    }

    if (options.dryRun) {
        showInfo('Mode prévisualisation (--dry-run). Aucun fichier n\'a été modifié.');
        return;
    }

    // Apply changes
    showStep('⚙️', 'Application des modifications...');
    const result = applyCodeBlocks(targetDir, blocks);

    if (result.applied.length > 0) {
        showSuccess(`${result.applied.length} fichier(s) mis à jour :`);
        for (const f of result.applied) console.log(`     ✏️  ${f}`);
    }
    if (result.created.length > 0) {
        showSuccess(`${result.created.length} fichier(s) créé(s) :`);
        for (const f of result.created) console.log(`     🆕  ${f}`);
    }
    if (result.errors.length > 0) {
        showWarning(`${result.errors.length} erreur(s) :`);
        for (const e of result.errors) console.log(`     ❌  ${e}`);
    }
}
