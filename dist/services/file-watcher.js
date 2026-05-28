"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileWatcher = void 0;
exports.createFileWatcher = createFileWatcher;
/**
 * services/file-watcher.ts
 *
 * Surveillance en temps réel des fichiers d'un projet.
 * Utilise chokidar pour détecter les changements et déclencher des analyses.
 */
const chokidar_1 = __importDefault(require("chokidar"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const events_1 = require("events");
const ignore_1 = __importDefault(require("ignore"));
class FileWatcher extends events_1.EventEmitter {
    watcher = null;
    options;
    ignoreRules;
    changeBuffer = new Map();
    DEFAULT_IGNORED = [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/*.log',
        '**/package-lock.json',
        '**/yarn.lock',
        '**/.env*',
    ];
    constructor(options) {
        super();
        if (typeof options === 'string') {
            this.options = {
                cwd: options,
                debounceMs: 500,
            };
        }
        else {
            this.options = {
                debounceMs: options.debounceMs || 500,
                ...options,
            };
        }
        // Initialize ignore rules
        const ignoredList = typeof options === 'string' ? [] : (options.ignored || []);
        this.ignoreRules = (0, ignore_1.default)().add([
            ...this.DEFAULT_IGNORED,
            ...ignoredList,
        ]);
    }
    /**
     * Start watching files
     */
    start() {
        const patterns = this.getWatchPatterns();
        console.log(`[👁️] Surveillance activée sur : ${this.options.cwd}`);
        if (this.options.includeExts) {
            console.log(`[👁️] Extensions surveillées : ${this.options.includeExts.join(', ')}`);
        }
        this.watcher = chokidar_1.default.watch(patterns, {
            cwd: this.options.cwd,
            ignored: (filePath) => {
                const relativePath = path_1.default.relative(this.options.cwd, path_1.default.join(this.options.cwd, filePath));
                return this.ignoreRules.ignores(relativePath);
            },
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 200,
                pollInterval: 100,
            },
        });
        this.watcher
            .on('add', (filePath) => this.handleFileEvent('add', filePath))
            .on('change', (filePath) => this.handleFileEvent('change', filePath))
            .on('unlink', (filePath) => this.handleFileEvent('unlink', filePath))
            .on('error', (error) => {
            console.error(`[❌] Erreur du watcher : ${error.message}`);
            this.emit('error', error);
        });
    }
    /**
     * Stop watching files
     */
    stop() {
        return new Promise((resolve) => {
            if (this.watcher) {
                // Clear all pending debounced events
                for (const timeout of this.changeBuffer.values()) {
                    clearTimeout(timeout);
                }
                this.changeBuffer.clear();
                this.watcher.close().then(() => {
                    console.log('[🛑] Surveillance arrêtée');
                    resolve();
                });
                this.watcher = null;
            }
            else {
                resolve();
            }
        });
    }
    /**
     * Get current content of a file
     */
    getFileContent(filePath) {
        try {
            const fullPath = path_1.default.resolve(this.options.cwd, filePath);
            if (!fs_1.default.existsSync(fullPath)) {
                return null;
            }
            return fs_1.default.readFileSync(fullPath, 'utf8');
        }
        catch (error) {
            console.error(`[⚠️] Impossible de lire ${filePath}: ${error.message}`);
            return null;
        }
    }
    /**
     * Get all tracked files with their content
     */
    getTrackedFiles() {
        const files = [];
        if (!this.watcher) {
            return files;
        }
        const watchedFiles = this.watcher.getWatched();
        for (const [dir, filenames] of Object.entries(watchedFiles)) {
            for (const filename of filenames) {
                const fullPath = path_1.default.join(dir, filename);
                const relativePath = path_1.default.relative(this.options.cwd, fullPath);
                if (!this.ignoreRules.ignores(relativePath)) {
                    const content = this.getFileContent(relativePath);
                    if (content !== null) {
                        files.push({ filePath: relativePath, content });
                    }
                }
            }
        }
        return files;
    }
    /**
     * Private: Get watch patterns based on extensions
     */
    getWatchPatterns() {
        if (this.options.includeExts && this.options.includeExts.length > 0) {
            return this.options.includeExts.map(ext => `**/*${ext}`);
        }
        return ['**/*'];
    }
    /**
     * Private: Handle file events with debouncing
     */
    handleFileEvent(type, filePath) {
        // Clear existing debounce for this file
        if (this.changeBuffer.has(filePath)) {
            clearTimeout(this.changeBuffer.get(filePath));
        }
        // Debounce the event
        const timeout = setTimeout(() => {
            this.changeBuffer.delete(filePath);
            const event = {
                type,
                filePath,
                timestamp: Date.now(),
            };
            if (type !== 'unlink') {
                event.content = this.getFileContent(filePath) || undefined;
            }
            console.log(`[📝] ${type === 'add' ? '🆕' : type === 'change' ? '✏️' : '🗑️'} ${filePath}`);
            this.emit('file-change', event);
        }, this.options.debounceMs);
        this.changeBuffer.set(filePath, timeout);
    }
}
exports.FileWatcher = FileWatcher;
/**
 * Create and start a file watcher
 */
function createFileWatcher(options) {
    const watcher = new FileWatcher(options);
    watcher.start();
    return watcher;
}
