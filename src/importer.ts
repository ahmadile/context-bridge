/**
 * Importer - Parse AI responses and apply code corrections back to project files
 * 
 * This module reads the AI's response (from clipboard or file), extracts
 * code blocks with file paths, shows a diff, and applies the changes.
 */
import fs from 'fs';
import path from 'path';
const chalk = require('chalk');

export interface CodeBlock {
    filePath: string;
    content: string;
    language: string;
}

/**
 * Parse AI response text and extract code blocks with file paths
 * 
 * Supports common formats used by ChatGPT and Claude:
 * - ```language filepath\ncode\n```
 * - ### `filepath`\n```\ncode\n```
 * - <file path="filepath">code</file>
 * - // filepath\n```\ncode\n```
 */
export function parseAIResponse(responseText: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    // Pattern 1: Markdown code blocks with filepath in the info string
    // ```ts src/scanner.ts
    // code here
    // ```
    const mdPattern1 = /```(\w+)\s+([^\n]+)\n([\s\S]*?)```/g;
    let match;
    while ((match = mdPattern1.exec(responseText)) !== null) {
        const lang = match[1];
        const potentialPath = match[2].trim();
        const code = match[3];
        if (looksLikeFilePath(potentialPath)) {
            blocks.push({ filePath: potentialPath, content: code.trimEnd(), language: lang });
        }
    }

    // Pattern 2: Heading with filepath then code block
    // ### `src/scanner.ts`
    // ```typescript
    // code
    // ```
    const mdPattern2 = /#{1,4}\s+`([^`]+)`\s*\n```\w*\n([\s\S]*?)```/g;
    while ((match = mdPattern2.exec(responseText)) !== null) {
        const potentialPath = match[1].trim();
        const code = match[2];
        if (looksLikeFilePath(potentialPath) && !blocks.find(b => b.filePath === potentialPath)) {
            const ext = potentialPath.split('.').pop() || 'text';
            blocks.push({ filePath: potentialPath, content: code.trimEnd(), language: ext });
        }
    }

    // Pattern 3: XML-style (Claude often uses this)
    // <file path="src/scanner.ts">
    // code
    // </file>
    const xmlPattern = /<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/g;
    while ((match = xmlPattern.exec(responseText)) !== null) {
        const potentialPath = match[1].trim();
        const code = match[2];
        if (!blocks.find(b => b.filePath === potentialPath)) {
            const ext = potentialPath.split('.').pop() || 'text';
            blocks.push({ filePath: potentialPath, content: code.trimEnd(), language: ext });
        }
    }

    // Pattern 4: Comment with filepath before code block
    // // src/scanner.ts
    // ```
    // code
    // ```
    const commentPattern = /\/\/\s*([^\n]+)\n```\w*\n([\s\S]*?)```/g;
    while ((match = commentPattern.exec(responseText)) !== null) {
        const potentialPath = match[1].trim();
        const code = match[2];
        if (looksLikeFilePath(potentialPath) && !blocks.find(b => b.filePath === potentialPath)) {
            const ext = potentialPath.split('.').pop() || 'text';
            blocks.push({ filePath: potentialPath, content: code.trimEnd(), language: ext });
        }
    }

    return blocks;
}

/**
 * Check if a string looks like a file path
 */
function looksLikeFilePath(str: string): boolean {
    // Must contain a dot (extension) and a slash or be a simple filename
    const hasExt = /\.\w{1,10}$/.test(str);
    const hasPathSep = str.includes('/') || str.includes('\\');
    const noSpaces = !str.includes(' ') || str.includes('/');
    const notTooLong = str.length < 200;
    return hasExt && notTooLong && noSpaces;
}

/**
 * Generate a simple diff between old and new content
 */
export function generateDiff(oldContent: string, newContent: string, filePath: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    let diff = '';

    diff += chalk.bold(`\n  📝 ${filePath}\n`);
    diff += chalk.gray('  ───────────────────────────────────────\n');

    // Simple line-by-line diff
    const maxLines = Math.max(oldLines.length, newLines.length);
    let changedLines = 0;

    for (let i = 0; i < maxLines; i++) {
        const oldLine = oldLines[i];
        const newLine = newLines[i];

        if (oldLine === undefined && newLine !== undefined) {
            diff += chalk.green(`  + ${i + 1}: ${newLine}\n`);
            changedLines++;
        } else if (newLine === undefined && oldLine !== undefined) {
            diff += chalk.red(`  - ${i + 1}: ${oldLine}\n`);
            changedLines++;
        } else if (oldLine !== newLine) {
            diff += chalk.red(`  - ${i + 1}: ${oldLine}\n`);
            diff += chalk.green(`  + ${i + 1}: ${newLine}\n`);
            changedLines++;
        }
        // Skip unchanged lines (just show changed)
    }

    if (changedLines === 0) {
        diff += chalk.gray('  (No changes detected)\n');
    } else {
        diff += chalk.cyan(`\n  ${changedLines} ligne(s) modifiée(s)\n`);
    }

    return diff;
}

/**
 * Apply parsed code blocks to the project files
 */
export function applyCodeBlocks(rootDir: string, blocks: CodeBlock[], dryRun: boolean = false): { applied: string[]; created: string[]; errors: string[] } {
    const applied: string[] = [];
    const created: string[] = [];
    const errors: string[] = [];

    for (const block of blocks) {
        const fullPath = path.resolve(rootDir, block.filePath);

        try {
            if (dryRun) {
                if (fs.existsSync(fullPath)) {
                    applied.push(block.filePath);
                } else {
                    created.push(block.filePath);
                }
            } else {
                // Create directory if it doesn't exist
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                if (fs.existsSync(fullPath)) {
                    fs.writeFileSync(fullPath, block.content, 'utf8');
                    applied.push(block.filePath);
                } else {
                    fs.writeFileSync(fullPath, block.content, 'utf8');
                    created.push(block.filePath);
                }
            }
        } catch (e: any) {
            errors.push(`${block.filePath}: ${e.message}`);
        }
    }

    return { applied, created, errors };
}
