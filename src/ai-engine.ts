import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';

// Path to store the model
const modelDir = path.join(os.homedir(), '.code-caricature', 'models');
const modelName = 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf'; // Very capable, very small model
const modelPath = path.join(modelDir, modelName);

export interface LocalChatSession {
  chat(message: string): Promise<string>;
}

export class AIEngine {
  private static instance: any = null;

  /**
   * Initialize the Llama engine.
   * In a real implementation, this would download the model if it doesn't exist,
   * then initialize the node-llama-cpp context.
   */
  static async init() {
    if (this.instance) return;
    
    // We dynamically import node-llama-cpp to avoid slowing down the CLI when AI is not used
    const { getLlama } = await (Function('return import("node-llama-cpp")')() as Promise<any>);
    
    if (!fs.existsSync(modelPath)) {
      console.log(`\n[!] Le modèle local n'a pas été trouvé à l'emplacement : ${modelPath}`);
      console.log(`[+] Début du téléchargement automatique de Qwen2.5-Coder (environ 1.1 Go)...`);
      console.log(`[+] Cette opération n'est effectuée qu'une seule fois.`);
      
      const modelUrl = 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
      await this.downloadModel(modelUrl, modelPath);
      console.log(`\n[+] Téléchargement terminé avec succès !`);
    }

    console.log(`[+] Initialisation du modèle local (${modelName})...`);
    const llama = await getLlama();
    this.instance = await llama.loadModel({ modelPath });
  }

  /**
   * Ask the local AI a question based on a given context (one-shot, no memory).
   */
  static async askLocalModel(systemPrompt: string, userPrompt: string): Promise<string> {
    await this.init();
    
    const { LlamaChatSession } = await (Function('return import("node-llama-cpp")')() as Promise<any>);
    const context = await this.instance.createContext();
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt
    });

    console.log(`[+] L'IA réfléchit (Localement)...`);
    const response = await session.prompt(userPrompt, { maxTokens: 1024 });
    const text = (response || '').trim();
    return text || "Réponse vide du modèle local. Reformulez votre question plus simplement.";
  }

  /**
   * Create a persistent chat session (keeps memory between messages).
   * Used for the interactive mentor loop.
   */
  static async createSession(systemPrompt: string): Promise<LocalChatSession> {
    await this.init();

    const { LlamaChatSession } = await (Function('return import("node-llama-cpp")')() as Promise<any>);
    const context = await this.instance.createContext();
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt
    });

    return {
      async chat(message: string): Promise<string> {
        console.log(`[+] L'IA locale réfléchit...`);
        const response = await session.prompt(message, {
          maxTokens: 1024,
        });
        const text = (response || '').trim();
        if (!text) {
          return (
            "Je n'ai pas pu formuler de réponse (sortie vide). " +
            "Essayez une question plus courte, ou configurez OPENAI_API_KEY pour utiliser la Grande IA."
          );
        }
        return text;
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
