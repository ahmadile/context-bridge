import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import chalk from 'chalk';

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
   * Check if Ollama is running locally
   */
  private static async checkOllama(): Promise<boolean> {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      return res.status === 200;
    } catch (e) {
      return false;
    }
  }

  /**
   * Query Ollama models and find the best suitable one
   */
  private static async getOllamaModel(): Promise<string> {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (res.status === 200) {
        const data = await res.json() as any;
        if (data.models && data.models.length > 0) {
          const names = data.models.map((m: any) => m.name);
          const qwenCoder = names.find((n: string) => n.toLowerCase().includes('qwen2.5-coder') || n.toLowerCase().includes('qwen2.5-coder:1.5b'));
          if (qwenCoder) return qwenCoder;
          
          const qwen = names.find((n: string) => n.toLowerCase().includes('qwen'));
          if (qwen) return qwen;
          
          const coder = names.find((n: string) => n.toLowerCase().includes('coder'));
          if (coder) return coder;

          return names[0];
        }
      }
    } catch (e) {}
    return 'qwen2.5-coder:1.5b'; // default fallback
  }

  /**
   * Initialize the local AI engine.
   * Checks for Ollama first, then falls back to node-llama-cpp if available.
   */
  static async init() {
    if (this.instance) return;

    // 1. Try Ollama first
    const ollamaRunning = await this.checkOllama();
    if (ollamaRunning) {
      const model = await this.getOllamaModel();
      this.instance = { type: 'ollama', model };
      return;
    }

    // 2. Fall back to node-llama-cpp if present
    try {
      const { getLlama } = await (Function('return import("node-llama-cpp")')() as Promise<any>);
      
      if (!fs.existsSync(modelPath)) {
        console.log(chalk.yellow(`\n[!] Le modèle local n'a pas été trouvé à l'emplacement : ${modelPath}`));
        console.log(chalk.blue(`[+] Début du téléchargement automatique de Qwen2.5-Coder (environ 1.1 Go)...`));
        console.log(chalk.blue(`[+] Cette opération n'est effectuée qu'une seule fois.`));
        
        const modelUrl = 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
        await this.downloadModel(modelUrl, modelPath);
        console.log(chalk.green(`\n[+] Téléchargement terminé avec succès !`));
      }

      console.log(chalk.green(`[+] Initialisation du modèle local via node-llama-cpp (${modelName})...`));
      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath });
      this.instance = { type: 'llama', model };
      return;
    } catch (e) {
      // Both failed
    }

    console.log(chalk.red(`\n[❌] Erreur : Aucun moteur d'IA locale disponible.`));
    console.log(chalk.yellow(`[!] Pour utiliser l'IA locale, veuillez au choix :`));
    console.log(chalk.yellow(`    1. Lancer Ollama localement (recommandé et très léger) :`));
    console.log(chalk.gray(`       - Téléchargez Ollama depuis https://ollama.com`));
    console.log(chalk.gray(`       - Lancez la commande suivante dans votre terminal :`));
    console.log(chalk.cyan(`         ollama run qwen2.5-coder:1.5b`));
    console.log(chalk.yellow(`    2. Ou réinstaller node-llama-cpp dans le projet :`));
    console.log(chalk.gray(`       - Exécutez : npm install node-llama-cpp@3.18.1`));
    
    throw new Error("Moteur d'IA locale indisponible (Ollama hors ligne et node-llama-cpp manquant).");
  }

  /**
   * Ask the local AI a question based on a given context (one-shot, no memory).
   */
  static async askLocalModel(systemPrompt: string, userPrompt: string): Promise<string> {
    await this.init();
    
    if (this.instance.type === 'ollama') {
      try {
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.instance.model,
            prompt: userPrompt,
            system: systemPrompt,
            stream: false
          })
        });
        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.statusText}`);
        }
        const data = await response.json() as any;
        return data.response;
      } catch (error) {
        console.error(chalk.red(`[❌] Erreur lors de l'appel à Ollama :`), error);
        throw error;
      }
    } else {
      const { LlamaChatSession } = await (Function('return import("node-llama-cpp")')() as Promise<any>);
      const context = await this.instance.model.createContext();
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: systemPrompt
      });

      console.log(chalk.gray(`[+] L'IA locale (node-llama-cpp) réfléchit...`));
      const response = await session.prompt(userPrompt);
      return response;
    }
  }

  /**
   * Create a persistent chat session (keeps memory between messages).
   * Used for the interactive mentor loop.
   */
  static async createSession(systemPrompt: string): Promise<LocalChatSession> {
    await this.init();

    if (this.instance.type === 'ollama') {
      const model = this.instance.model;
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];
      return {
        async chat(message: string): Promise<string> {
          messages.push({ role: 'user', content: message });
          try {
            const response = await fetch('http://localhost:11434/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: model,
                messages: messages,
                stream: false
              })
            });
            if (!response.ok) {
              throw new Error(`Ollama API error: ${response.statusText}`);
            }
            const data = await response.json() as any;
            const reply = data.message.content;
            messages.push({ role: 'assistant', content: reply });
            return reply;
          } catch (error) {
            console.error(chalk.red(`[❌] Erreur lors du chat avec Ollama :`), error);
            throw error;
          }
        }
      };
    } else {
      const { LlamaChatSession } = await (Function('return import("node-llama-cpp")')() as Promise<any>);
      const context = await this.instance.model.createContext();
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: systemPrompt
      });

      return {
        async chat(message: string): Promise<string> {
          return await session.prompt(message);
        }
      };
    }
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
