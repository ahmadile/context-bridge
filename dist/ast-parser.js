"use strict";
/**
 * AST Parser - Extracts code architecture (function/class signatures)
 * without including implementation details.
 * Uses regex-based extraction (lightweight, no external parser needed).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSignatures = extractSignatures;
exports.formatSignatures = formatSignatures;
/**
 * Extract architecture signatures from a file based on its extension
 */
function extractSignatures(content, filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'ts':
        case 'tsx':
        case 'js':
        case 'jsx':
            return extractJSSignatures(content);
        case 'py':
            return extractPythonSignatures(content);
        case 'java':
        case 'kt':
            return extractJavaSignatures(content);
        default:
            return extractJSSignatures(content); // fallback
    }
}
function extractJSSignatures(content) {
    const signatures = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();
        // Imports
        if (trimmed.startsWith('import ')) {
            signatures.push({ type: 'import', name: '', signature: trimmed, line: lineNum });
            continue;
        }
        // Exports
        if (trimmed.startsWith('export default ')) {
            signatures.push({ type: 'export', name: 'default', signature: trimmed.split('{')[0].trim(), line: lineNum });
            continue;
        }
        // Interfaces
        const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w,\s<>]+)?\s*\{/);
        if (interfaceMatch) {
            signatures.push({ type: 'interface', name: interfaceMatch[1], signature: trimmed.replace(/\{.*/, '{...}'), line: lineNum });
            continue;
        }
        // Type aliases
        const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)\s*=\s*/);
        if (typeMatch) {
            signatures.push({ type: 'type', name: typeMatch[1], signature: trimmed, line: lineNum });
            continue;
        }
        // Classes
        const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/);
        if (classMatch) {
            signatures.push({ type: 'class', name: classMatch[1], signature: trimmed.replace(/\{.*/, '{...}'), line: lineNum });
            continue;
        }
        // Functions (named, arrow, async)
        const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/);
        if (funcMatch) {
            signatures.push({ type: 'function', name: funcMatch[1], signature: trimmed.split('{')[0].trim(), line: lineNum });
            continue;
        }
        // Arrow functions assigned to const/let
        const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+)?\s*=>/);
        if (arrowMatch) {
            signatures.push({ type: 'function', name: arrowMatch[1], signature: trimmed.split('=>')[0].trim() + ' => {...}', line: lineNum });
            continue;
        }
        // Class methods (inside a class body)
        const methodMatch = trimmed.match(/^(?:public|private|protected|static|async|readonly|\s)*(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|]+)?\s*\{/);
        if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'else'].includes(methodMatch[1])) {
            signatures.push({ type: 'function', name: methodMatch[1], signature: trimmed.split('{')[0].trim(), line: lineNum });
            continue;
        }
        // Important constants (exported)
        const constMatch = trimmed.match(/^export\s+(?:const|let|var)\s+(\w+)\s*(?::\s*[\w<>\[\]|]+)?\s*=/);
        if (constMatch) {
            signatures.push({ type: 'variable', name: constMatch[1], signature: trimmed.split('=')[0].trim(), line: lineNum });
        }
    }
    return signatures;
}
function extractPythonSignatures(content) {
    const signatures = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();
        // Imports
        if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
            signatures.push({ type: 'import', name: '', signature: trimmed, line: lineNum });
            continue;
        }
        // Classes
        const classMatch = trimmed.match(/^class\s+(\w+)(?:\([^)]*\))?\s*:/);
        if (classMatch) {
            signatures.push({ type: 'class', name: classMatch[1], signature: trimmed, line: lineNum });
            continue;
        }
        // Functions
        const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\([^)]*\)/);
        if (funcMatch) {
            signatures.push({ type: 'function', name: funcMatch[1], signature: trimmed, line: lineNum });
        }
    }
    return signatures;
}
function extractJavaSignatures(content) {
    const signatures = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();
        // Imports
        if (trimmed.startsWith('import ')) {
            signatures.push({ type: 'import', name: '', signature: trimmed, line: lineNum });
            continue;
        }
        // Classes
        const classMatch = trimmed.match(/^(?:public|private|protected|abstract|static|final|\s)*class\s+(\w+)/);
        if (classMatch) {
            signatures.push({ type: 'class', name: classMatch[1], signature: trimmed.replace(/\{.*/, '{...}'), line: lineNum });
            continue;
        }
        // Interfaces
        const ifMatch = trimmed.match(/^(?:public\s+)?interface\s+(\w+)/);
        if (ifMatch) {
            signatures.push({ type: 'interface', name: ifMatch[1], signature: trimmed.replace(/\{.*/, '{...}'), line: lineNum });
            continue;
        }
        // Methods
        const methodMatch = trimmed.match(/^(?:public|private|protected|static|final|abstract|synchronized|\s)*[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)/);
        if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(methodMatch[1])) {
            signatures.push({ type: 'function', name: methodMatch[1], signature: trimmed.split('{')[0].trim(), line: lineNum });
        }
    }
    return signatures;
}
/**
 * Format extracted signatures into a readable architecture overview
 */
function formatSignatures(signatures, filePath) {
    if (signatures.length === 0)
        return `// ${filePath}: No signatures extracted`;
    let result = '';
    const imports = signatures.filter(s => s.type === 'import');
    const types = signatures.filter(s => s.type === 'interface' || s.type === 'type');
    const classes = signatures.filter(s => s.type === 'class');
    const functions = signatures.filter(s => s.type === 'function');
    const variables = signatures.filter(s => s.type === 'variable');
    const exports = signatures.filter(s => s.type === 'export');
    if (imports.length > 0) {
        result += `// --- Imports ---\n`;
        for (const s of imports)
            result += `${s.signature}\n`;
        result += '\n';
    }
    if (types.length > 0) {
        result += `// --- Types & Interfaces ---\n`;
        for (const s of types)
            result += `${s.signature}  // line ${s.line}\n`;
        result += '\n';
    }
    if (classes.length > 0) {
        result += `// --- Classes ---\n`;
        for (const s of classes)
            result += `${s.signature}  // line ${s.line}\n`;
        result += '\n';
    }
    if (functions.length > 0) {
        result += `// --- Functions ---\n`;
        for (const s of functions)
            result += `${s.signature}  // line ${s.line}\n`;
        result += '\n';
    }
    if (variables.length > 0) {
        result += `// --- Exports ---\n`;
        for (const s of variables)
            result += `${s.signature}  // line ${s.line}\n`;
        result += '\n';
    }
    if (exports.length > 0) {
        for (const s of exports)
            result += `${s.signature}  // line ${s.line}\n`;
    }
    return result;
}
