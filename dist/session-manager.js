"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSession = saveSession;
exports.loadSession = loadSession;
exports.deleteSession = deleteSession;
/**
 * session-manager.ts
 *
 * Gère la persistance et la restauration des sessions de chat et de tutoriel.
 * Les sessions sont enregistrées par projet, identifiées par un hash du dossier de travail (CWD).
 */
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const sessionDir = path_1.default.join(os_1.default.homedir(), '.code-caricature', 'sessions');
/**
 * Generates a unique SHA-256 hash for the current working directory
 */
function getWorkspaceHash() {
    const cwd = process.cwd();
    return crypto_1.default.createHash('sha256').update(cwd).digest('hex');
}
/**
 * Saves a session history to disk
 */
function saveSession(type, history) {
    try {
        const hash = getWorkspaceHash();
        const sessionPath = path_1.default.join(sessionDir, `${type}-${hash}.json`);
        fs_1.default.mkdirSync(sessionDir, { recursive: true });
        const data = {
            cwd: process.cwd(),
            updatedAt: new Date().toISOString(),
            history
        };
        fs_1.default.writeFileSync(sessionPath, JSON.stringify(data, null, 2), 'utf8');
    }
    catch (e) { }
}
/**
 * Loads a session history from disk
 */
function loadSession(type) {
    try {
        const hash = getWorkspaceHash();
        const sessionPath = path_1.default.join(sessionDir, `${type}-${hash}.json`);
        if (fs_1.default.existsSync(sessionPath)) {
            const raw = fs_1.default.readFileSync(sessionPath, 'utf8');
            const data = JSON.parse(raw);
            // Verify that the session belongs to the same directory
            if (data.cwd === process.cwd()) {
                return data.history;
            }
        }
    }
    catch (e) { }
    return null;
}
/**
 * Deletes a session history
 */
function deleteSession(type) {
    try {
        const hash = getWorkspaceHash();
        const sessionPath = path_1.default.join(sessionDir, `${type}-${hash}.json`);
        if (fs_1.default.existsSync(sessionPath)) {
            fs_1.default.unlinkSync(sessionPath);
        }
    }
    catch (e) { }
}
