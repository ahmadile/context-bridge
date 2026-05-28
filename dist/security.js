"use strict";
/**
 * Security module - Detects and redacts sensitive data before sending to AI
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactSensitiveData = redactSensitiveData;
exports.isSensitiveFile = isSensitiveFile;
const SENSITIVE_PATTERNS = [
    // API Keys & Tokens
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{16,}['"]?/gi, label: 'API_KEY' },
    { pattern: /(?:access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{16,}['"]?/gi, label: 'TOKEN' },
    { pattern: /(?:secret[_-]?key|client[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{16,}['"]?/gi, label: 'SECRET' },
    // Passwords
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{6,}['"]?/gi, label: 'PASSWORD' },
    // Database URLs
    { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+/gi, label: 'DB_URL' },
    // AWS
    { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS_KEY' },
    // JWT tokens
    { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'JWT_TOKEN' },
    // Private keys
    { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, label: 'PRIVATE_KEY' },
    // Generic secrets in env-style files
    { pattern: /(?:SECRET|TOKEN|PRIVATE|CREDENTIAL)\s*[:=]\s*['"]?[A-Za-z0-9\-_/+=]{16,}['"]?/gi, label: 'SECRET' },
];
/**
 * Scans text content and replaces sensitive data with [REDACTED] tags
 */
function redactSensitiveData(content, filePath) {
    let redactedContent = content;
    let redactedCount = 0;
    const details = [];
    for (const { pattern, label } of SENSITIVE_PATTERNS) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        const matches = redactedContent.match(pattern);
        if (matches) {
            for (const match of matches) {
                redactedContent = redactedContent.replace(match, `[🔒 REDACTED: ${label}]`);
                redactedCount++;
                details.push(`${filePath}: ${label} detected and redacted`);
            }
        }
    }
    return { content: redactedContent, redactedCount, details };
}
/**
 * Check if a file is likely a sensitive config file
 */
function isSensitiveFile(filePath) {
    const sensitiveNames = [
        '.env', '.env.local', '.env.production', '.env.development',
        'credentials', 'secrets', '.npmrc', '.pypirc',
        'id_rsa', 'id_ed25519', 'id_dsa',
    ];
    const lower = filePath.toLowerCase();
    return sensitiveNames.some(name => lower.endsWith(name) || lower.includes(name + '.'));
}
