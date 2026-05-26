/**
 * Dependency Graph - Analyzes imports to find related files
 */
import fs from 'fs';
import path from 'path';

export interface DependencyNode {
    file: string;
    imports: string[];
    importedBy: string[];
}

/**
 * Parse import statements from a file to find dependencies
 */
function parseImports(content: string, filePath: string, rootDir: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n');
    const ext = path.extname(filePath);
    const fileDir = path.dirname(path.resolve(rootDir, filePath));

    for (const line of lines) {
        const trimmed = line.trim();
        let importPath: string | null = null;

        // JS/TS: import ... from './xxx'
        const esImport = trimmed.match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/);
        if (esImport) {
            importPath = esImport[1];
        }

        // JS/TS: require('./xxx')
        const cjsImport = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (cjsImport) {
            importPath = cjsImport[1];
        }

        // Python: from xxx import yyy
        const pyImport = trimmed.match(/^from\s+(\S+)\s+import/);
        if (pyImport && !pyImport[1].startsWith('.')) {
            // Skip external packages
            continue;
        }
        if (pyImport && pyImport[1].startsWith('.')) {
            importPath = pyImport[1];
        }

        if (importPath && importPath.startsWith('.')) {
            // Resolve relative path
            const resolved = path.resolve(fileDir, importPath);
            const relative = path.relative(rootDir, resolved).replace(/\\/g, '/');
            
            // Try to find the actual file (with extension)
            const possibleExts = [ext, '.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.js'];
            for (const tryExt of possibleExts) {
                const fullPath = relative.endsWith(tryExt) ? relative : relative + tryExt;
                if (fs.existsSync(path.join(rootDir, fullPath))) {
                    imports.push(fullPath);
                    break;
                }
            }
        }
    }

    return imports;
}

/**
 * Build a complete dependency graph for the project
 */
export function buildDependencyGraph(rootDir: string, files: string[], fileContents: { [key: string]: string }): Map<string, DependencyNode> {
    const graph = new Map<string, DependencyNode>();

    // Initialize nodes
    for (const file of files) {
        graph.set(file, { file, imports: [], importedBy: [] });
    }

    // Parse imports and build edges
    for (const file of files) {
        const content = fileContents[file];
        if (!content || content.startsWith('//')) continue; // Skip error/ignored files
        
        const imports = parseImports(content, file, rootDir);
        const node = graph.get(file)!;
        node.imports = imports;

        // Add reverse edges
        for (const imp of imports) {
            const importedNode = graph.get(imp);
            if (importedNode) {
                importedNode.importedBy.push(file);
            }
        }
    }

    return graph;
}

/**
 * Get all files related to a target file (imports + imported by), recursively
 */
export function getRelatedFiles(graph: Map<string, DependencyNode>, targetFile: string, depth: number = 2): string[] {
    const visited = new Set<string>();
    const queue: { file: string; currentDepth: number }[] = [{ file: targetFile, currentDepth: 0 }];

    while (queue.length > 0) {
        const { file, currentDepth } = queue.shift()!;
        if (visited.has(file) || currentDepth > depth) continue;
        visited.add(file);

        const node = graph.get(file);
        if (!node) continue;

        for (const imp of [...node.imports, ...node.importedBy]) {
            if (!visited.has(imp)) {
                queue.push({ file: imp, currentDepth: currentDepth + 1 });
            }
        }
    }

    return Array.from(visited);
}

/**
 * Format the dependency graph as a readable text
 */
export function formatDependencyGraph(graph: Map<string, DependencyNode>, targetFile?: string): string {
    let result = '';

    if (targetFile) {
        const node = graph.get(targetFile);
        if (node) {
            result += `📌 Focus: ${targetFile}\n`;
            result += `  ↪ Imports: ${node.imports.length > 0 ? node.imports.join(', ') : '(none)'}\n`;
            result += `  ↩ Used by: ${node.importedBy.length > 0 ? node.importedBy.join(', ') : '(none)'}\n\n`;
        }
    }

    for (const [file, node] of graph) {
        if (node.imports.length > 0 || node.importedBy.length > 0) {
            result += `${file}\n`;
            if (node.imports.length > 0) result += `  → ${node.imports.join(', ')}\n`;
            if (node.importedBy.length > 0) result += `  ← ${node.importedBy.join(', ')}\n`;
        }
    }

    return result;
}
