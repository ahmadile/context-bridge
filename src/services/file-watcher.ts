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

  constructor(options: WatchOptions | string) {
    super();
    if (typeof options === 'string') {
      this.options = {
        cwd: options,
        debounceMs: 500,
      };
    } else {
      this.options = {
        debounceMs: options.debounceMs || 500,
        ...options,
      };
    }
    
    // Initialize ignore rules
    const ignoredList = typeof options === 'string' ? [] : (options.ignored || []);
    this.ignoreRules = ignore().add([
      ...this.DEFAULT_IGNORED,
      ...ignoredList,
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
        // Normaliser le chemin: utiliser des slashes forward pour le module ignore
        // et s'assurer qu'il est relatif
        if (!filePath || filePath.trim() === '') {
          return true; // Ignorer les chemins vides
        }
        
        let normalizedPath = filePath;
        if (path.isAbsolute(filePath)) {
          normalizedPath = path.relative(this.options.cwd, filePath);
        }
        // Remplacer les antislashes par des slashes forward (requis par le module ignore)
        normalizedPath = normalizedPath.replace(/\\/g, '/');
        
        // Ignorer si le chemin est toujours vide après normalisation
        if (!normalizedPath || normalizedPath.trim() === '') {
          return true;
        }
        
        return this.ignoreRules.ignores(normalizedPath);
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
        let relativePath = path.relative(this.options.cwd, fullPath);
        // Normaliser les slashes pour le module ignore
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        // Vérifier que le chemin n'est pas vide
        if (normalizedPath && normalizedPath.trim() !== '' && !this.ignoreRules.ignores(normalizedPath)) {
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
