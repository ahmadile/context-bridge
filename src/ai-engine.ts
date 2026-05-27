import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';

// Path to store the model
const modelDir = path.join(os.homedir(), '.code-caricature', 'models');
const modelName = 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
const modelPath = path.join(modelDir, modelName);

export interface LocalChatSession {
  chat(message: string): Promise<string>;
}

export class AIEngine {
  private static instance: any = null;

  /**
   * Initialize the Llama engine - DISABLED for space constraints
   */
  static async init() {
    if (this.instance) return;
    
    console.log(`[!] Le modèle local (node-llama-cpp) a été désactivé pour économiser l'espace disque.`);
    console.log(`[+] Veuillez utiliser OPENAI_API_KEY ou une autre API cloud pour les fonctionnalités IA.`);
    throw new Error("Local AI engine is disabled due to missing node-llama-cpp dependency");
  }

  /**
   * Ask the local AI a question based on a given context (one-shot, no memory).
   */
  static async askLocalModel(systemPrompt: string, userPrompt: string): Promise<string> {
    await this.init();
    return "Local AI is currently disabled.";
  }

  /**
   * Create a persistent chat session (keeps memory between messages).
   * Used for the interactive mentor loop.
   */
  static async createSession(systemPrompt: string): Promise<LocalChatSession> {
    await this.init();
    return {
      async chat(message: string): Promise<string> {
        return "Local AI is currently disabled.";
      }
    };
  }

  /**
   * Helper function to download large files with progress
   */
  private static async downloadModel(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);

      const download = (url: string) => {
        https.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
             download(response.headers.location!);
             return;
          }
          
          if (response.statusCode !== 200) {
             reject(new Error(`Échec du téléchargement (${response.statusCode})`));
             return;
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          let downloaded = 0;
          let lastPercent = -1;

          response.on('data', (chunk) => {
            downloaded += chunk.length;
            if (totalSize > 0) {
              const percent = Math.floor((downloaded / totalSize) * 100);
              if (percent > lastPercent) {
                 process.stdout.write(`\r[+] Téléchargement : ${percent}% `);
                 lastPercent = percent;
              }
            }
          });

          response.pipe(file);
          file.on('finish', () => {
            process.stdout.write('\n');
            file.close(() => resolve());
          });
        }).on('error', (err) => {
          fs.unlink(dest, () => reject(err));
        });
      };

      download(url);
    });
  }
}
