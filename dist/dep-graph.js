"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDependencyGraph = buildDependencyGraph;
exports.getRelatedFiles = getRelatedFiles;
exports.formatDependencyGraph = formatDependencyGraph;
/**
 * Dependency Graph - Analyzes imports to find related files
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Parse import statements from a file to find dependencies
 */
function parseImports(content, filePath, rootDir) {
    const imports = [];
    const lines = content.split('\n');
    const ext = path_1.default.extname(filePath);
    const fileDir = path_1.default.dirname(path_1.default.resolve(rootDir, filePath));
    for (const line of lines) {
        const trimmed = line.trim();
        let importPath = null;
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
            const resolved = path_1.default.resolve(fileDir, importPath);
            const relative = path_1.default.relative(rootDir, resolved).replace(/\\/g, '/');
            // Try to find the actual file (with extension)
            const possibleExts = [ext, '.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.js'];
            for (const tryExt of possibleExts) {
                const fullPath = relative.endsWith(tryExt) ? relative : relative + tryExt;
                if (fs_1.default.existsSync(path_1.default.join(rootDir, fullPath))) {
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
function buildDependencyGraph(rootDir, files, fileContents) {
    const graph = new Map();
    // Initialize nodes
    for (const file of files) {
        graph.set(file, { file, imports: [], importedBy: [] });
    }
    // Parse imports and build edges
    for (const file of files) {
        const content = fileContents[file];
        if (!content || content.startsWith('//'))
            continue; // Skip error/ignored files
        const imports = parseImports(content, file, rootDir);
        const node = graph.get(file);
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
function getRelatedFiles(graph, targetFile, depth = 2) {
    const visited = new Set();
    const queue = [{ file: targetFile, currentDepth: 0 }];
    while (queue.length > 0) {
        const { file, currentDepth } = queue.shift();
        if (visited.has(file) || currentDepth > depth)
            continue;
        visited.add(file);
        const node = graph.get(file);
        if (!node)
            continue;
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
function formatDependencyGraph(graph, targetFile) {
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
            if (node.imports.length > 0)
                result += `  → ${node.imports.join(', ')}\n`;
            if (node.importedBy.length > 0)
                result += `  ← ${node.importedBy.join(', ')}\n`;
        }
    }
    return result;
}
