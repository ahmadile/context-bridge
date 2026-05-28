"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanDirectory = scanDirectory;
exports.generateTree = generateTree;
exports.readFilesContent = readFilesContent;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ignore_1 = __importDefault(require("ignore"));
const security_1 = require("./security");
// ─── Binary File Detection ──────────────────────────────────────────
function isBinaryFileSync(filePath) {
    const buffer = Buffer.alloc(512);
    try {
        const fd = fs_1.default.openSync(filePath, 'r');
        const bytesRead = fs_1.default.readSync(fd, buffer, 0, 512, 0);
        fs_1.default.closeSync(fd);
        for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0)
                return true;
        }
    }
    catch (e) {
        return true;
    }
    return false;
}
// ─── Gitignore ──────────────────────────────────────────────────────
function getIgnorer(dirPath) {
    const ig = (0, ignore_1.default)();
    ig.add(['.git', 'node_modules', 'dist', 'build', '.env', '*.log', '.DS_Store']);
    const gitignorePath = path_1.default.join(dirPath, '.gitignore');
    if (fs_1.default.existsSync(gitignorePath)) {
        ig.add(fs_1.default.readFileSync(gitignorePath, 'utf8'));
    }
    return ig;
}
// ─── Main Scanner ───────────────────────────────────────────────────
function scanDirectory(dirPath, rootPath = dirPath, ig = getIgnorer(rootPath), options = {}) {
    let results = [];
    if (!fs_1.default.existsSync(dirPath))
        return results;
    const list = fs_1.default.readdirSync(dirPath);
    for (const file of list) {
        const fullPath = path_1.default.join(dirPath, file);
        const relativePath = path_1.default.relative(rootPath, fullPath).replace(/\\/g, '/');
        if (ig.ignores(relativePath))
            continue;
        const stat = fs_1.default.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(scanDirectory(fullPath, rootPath, ig, options));
        }
        else {
            // Extension filter
            if (options.includeExts && options.includeExts.length > 0) {
                const ext = path_1.default.extname(file);
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
function generateTree(files) {
    const tree = {};
    for (const file of files) {
        const parts = file.split('/');
        let current = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = i === parts.length - 1 ? null : {};
            }
            if (current[part] !== null) {
                current = current[part];
            }
        }
    }
    function buildString(node, prefix = '') {
        let result = '';
        const keys = Object.keys(node);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const isLast = i === keys.length - 1;
            result += `${prefix}${isLast ? '└── ' : '├── '}${key}\n`;
            if (node[key] !== null) {
                result += buildString(node[key], prefix + (isLast ? '    ' : '│   '));
            }
        }
        return result;
    }
    return buildString(tree);
}
// ─── File Reader (with Security Redaction) ──────────────────────────
function readFilesContent(rootPath, files, enableSecurity = true) {
    const contents = {};
    const securityReport = [];
    for (const file of files) {
        const fullPath = path_1.default.join(rootPath, file);
        try {
            const stat = fs_1.default.statSync(fullPath);
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
            if ((0, security_1.isSensitiveFile)(file)) {
                contents[file] = `// [🔒 SENSITIVE FILE EXCLUDED: ${file}]`;
                securityReport.push(`🔒 ${file}: Sensitive config file excluded entirely`);
                continue;
            }
            let content = fs_1.default.readFileSync(fullPath, 'utf8');
            // Apply security redaction
            if (enableSecurity) {
                const result = (0, security_1.redactSensitiveData)(content, file);
                content = result.content;
                if (result.redactedCount > 0) {
                    securityReport.push(...result.details);
                }
            }
            contents[file] = content;
        }
        catch (e) {
            contents[file] = `// [Error reading file]`;
        }
    }
    return { contents, securityReport };
}
