import fs from 'fs';
import path from 'path';
import ignore from 'ignore';
import { redactSensitiveData, isSensitiveFile, RedactResult } from './security';

// ─── Proper TypeScript Interfaces (Fix Qwen #1) ─────────────────────

export interface ScanOptions {
    includeExts?: string[];
    sinceMs?: number;
}

type TreeNode = { [key: string]: TreeNode | null };

export interface ScanResult {
    files: string[];
    securityReport: string[];
}

// ─── Binary File Detection ──────────────────────────────────────────

function isBinaryFileSync(filePath: string): boolean {
    const buffer = Buffer.alloc(512);
    try {
        const fd = fs.openSync(filePath, 'r');
        const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
        fs.closeSync(fd);
        for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0) return true;
        }
    } catch (e) {
        return true;
    }
    return false;
}

// ─── Gitignore ──────────────────────────────────────────────────────

function getIgnorer(dirPath: string) {
    const ig = ignore();
    ig.add(['.git', 'node_modules', 'dist', 'build', '.env', '*.log', '.DS_Store']);
    const gitignorePath = path.join(dirPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        ig.add(fs.readFileSync(gitignorePath, 'utf8'));
    }
    return ig;
}

// ─── Main Scanner ───────────────────────────────────────────────────

export function scanDirectory(dirPath: string, rootPath = dirPath, ig = getIgnorer(rootPath), options: ScanOptions = {}): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dirPath)) return results;

    const list = fs.readdirSync(dirPath);
    for (const file of list) {
        const fullPath = path.join(dirPath, file);
        const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

        if (ig.ignores(relativePath)) continue;

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(scanDirectory(fullPath, rootPath, ig, options));
        } else {
            // Extension filter
            if (options.includeExts && options.includeExts.length > 0) {
                const ext = path.extname(file);
                if (!options.includeExts.includes(ext) && !options.includeExts.includes(file)) {
                    continue;
                }
            }
            // Modification time filter
            if (options.sinceMs && stat.mtimeMs < options.sinceMs) {
                continue;
            }
            results.push(relativePath);
        }
    }
    return results;
}

// ─── Tree Generator (Fixed: proper types) ───────────────────────────

export function generateTree(files: string[]): string {
    const tree: TreeNode = {};
    for (const file of files) {
        const parts = file.split('/');
        let current: TreeNode = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = i === parts.length - 1 ? null : {};
            }
            if (current[part] !== null) {
                current = current[part] as TreeNode;
            }
        }
    }

    function buildString(node: TreeNode, prefix = ''): string {
        let result = '';
        const keys = Object.keys(node);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const isLast = i === keys.length - 1;
            result += `${prefix}${isLast ? '└── ' : '├── '}${key}\n`;
            if (node[key] !== null) {
                result += buildString(node[key] as TreeNode, prefix + (isLast ? '    ' : '│   '));
            }
        }
        return result;
    }
    return buildString(tree);
}

// ─── File Reader (with Security Redaction) ──────────────────────────

export function readFilesContent(rootPath: string, files: string[], enableSecurity: boolean = true): { contents: { [key: string]: string }; securityReport: string[] } {
    const contents: { [key: string]: string } = {};
    const securityReport: string[] = [];

    for (const file of files) {
        const fullPath = path.join(rootPath, file);
        try {
            const stat = fs.statSync(fullPath);
            
            // Skip large files (> 1MB)
            if (stat.size > 1024 * 1024) {
                contents[file] = `// [Ignored: File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB)]`;
                continue;
            }
            
            // Skip binary files
            if (isBinaryFileSync(fullPath)) {
                contents[file] = `// [Ignored: Binary file]`;
                continue;
            }

            // Warn about sensitive files
            if (isSensitiveFile(file)) {
                contents[file] = `// [🔒 SENSITIVE FILE EXCLUDED: ${file}]`;
                securityReport.push(`🔒 ${file}: Sensitive config file excluded entirely`);
                continue;
            }

            let content = fs.readFileSync(fullPath, 'utf8');

            // Apply security redaction
            if (enableSecurity) {
                const result: RedactResult = redactSensitiveData(content, file);
                content = result.content;
                if (result.redactedCount > 0) {
                    securityReport.push(...result.details);
                }
            }

            contents[file] = content;
        } catch (e) {
            contents[file] = `// [Error reading file]`;
        }
    }

    return { contents, securityReport };
}
