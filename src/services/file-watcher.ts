/**
 * services/file-watcher.ts
 * 
 * Surveillance en temps réel des fichiers d'un projet.
 * Utilise chokidar pour détecter les changements et déclencher des analyses.
 */
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import ignore from 'ignore';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  content?: string;
  timestamp: number;
}

export interface WatchOptions {
  cwd: string;
  ignored?: string[];
  debounceMs?: number;
  includeExts?: string[];
}

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private options: WatchOptions;
  private ignoreRules: any;
  private changeBuffer: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_IGNORED = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/*.log',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/.env*',
  ];

  constructor(options: WatchOptions) {
    super();
    this.options = {
      debounceMs: options.debounceMs || 500,
      ...options,
    };
    
    // Initialize ignore rules
    this.ignoreRules = ignore().add([
      ...this.DEFAULT_IGNORED,
      ...(options.ignored || []),
    ]);
  }

  /**
   * Start watching files
   */
  start(): void {
    const patterns = this.getWatchPatterns();
    
    console.log(`[👁️] Surveillance activée sur : ${this.options.cwd}`);
    if (this.options.includeExts) {
      console.log(`[👁️] Extensions surveillées : ${this.options.includeExts.join(', ')}`);
    }

    this.watcher = chokidar.watch(patterns, {
      cwd: this.options.cwd,
      ignored: (filePath: string) => {
        const relativePath = path.relative(this.options.cwd, path.join(this.options.cwd, filePath));
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
  stop(): Promise<void> {
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
      } else {
        resolve();
      }
    });
  }

  /**
   * Get current content of a file
   */
  getFileContent(filePath: string): string | null {
    try {
      const fullPath = path.resolve(this.options.cwd, filePath);
      if (!fs.existsSync(fullPath)) {
        return null;
      }
      return fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
      console.error(`[⚠️] Impossible de lire ${filePath}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get all tracked files with their content
   */
  getTrackedFiles(): Array<{ filePath: string; content: string }> {
    const files: Array<{ filePath: string; content: string }> = [];
    
    if (!this.watcher) {
      return files;
    }

    const watchedFiles = this.watcher.getWatched();
    for (const [dir, filenames] of Object.entries(watchedFiles)) {
      for (const filename of filenames) {
        const fullPath = path.join(dir, filename);
        const relativePath = path.relative(this.options.cwd, fullPath);
        
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
  private getWatchPatterns(): string[] {
    if (this.options.includeExts && this.options.includeExts.length > 0) {
      return this.options.includeExts.map(ext => `**/*${ext}`);
    }
    return ['**/*'];
  }

  /**
   * Private: Handle file events with debouncing
   */
  private handleFileEvent(type: 'add' | 'change' | 'unlink', filePath: string): void {
    // Clear existing debounce for this file
    if (this.changeBuffer.has(filePath)) {
      clearTimeout(this.changeBuffer.get(filePath)!);
    }

    // Debounce the event
    const timeout = setTimeout(() => {
      this.changeBuffer.delete(filePath);
      
      const event: FileChangeEvent = {
        type,
        filePath,
        timestamp: Date.now(),
      };

      if (type !== 'unlink') {
        event.content = this.getFileContent(filePath) || undefined;
      }

      console.log(`[📝] ${type === 'add' ? '🆕' : type === 'change' ? '✏️' : '🗑️'} ${filePath}`);
      this.emit('file-change', event);
    }, this.options.debounceMs!);

    this.changeBuffer.set(filePath, timeout);
  }
}

/**
 * Create and start a file watcher
 */
export function createFileWatcher(options: WatchOptions): FileWatcher {
  const watcher = new FileWatcher(options);
  watcher.start();
  return watcher;
}
