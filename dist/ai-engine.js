"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIEngine = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const https_1 = __importDefault(require("https"));
// Path to store the model
const modelDir = path_1.default.join(os_1.default.homedir(), '.code-caricature', 'models');
const modelName = 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
const modelPath = path_1.default.join(modelDir, modelName);
class AIEngine {
    static instance = null;
    /**
     * Initialize the Llama engine - DISABLED for space constraints
     */
    static async init() {
        if (this.instance)
            return;
        console.log(`[!] Le modèle local (node-llama-cpp) a été désactivé pour économiser l'espace disque.`);
        console.log(`[+] Veuillez utiliser OPENAI_API_KEY ou une autre API cloud pour les fonctionnalités IA.`);
        throw new Error("Local AI engine is disabled due to missing node-llama-cpp dependency");
    }
    /**
     * Ask the local AI a question based on a given context (one-shot, no memory).
     */
    static async askLocalModel(systemPrompt, userPrompt) {
        await this.init();
        return "Local AI is currently disabled.";
    }
    /**
     * Create a persistent chat session (keeps memory between messages).
     * Used for the interactive mentor loop.
     */
    static async createSession(systemPrompt) {
        await this.init();
        return {
            async chat(message) {
                return "Local AI is currently disabled.";
            }
        };
    }
    /**
     * Helper function to download large files with progress
     */
    static async downloadModel(url, dest) {
        return new Promise((resolve, reject) => {
            fs_1.default.mkdirSync(path_1.default.dirname(dest), { recursive: true });
            const file = fs_1.default.createWriteStream(dest);
            const download = (url) => {
                https_1.default.get(url, (response) => {
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        download(response.headers.location);
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
                    fs_1.default.unlink(dest, () => reject(err));
                });
            };
            download(url);
        });
    }
}
exports.AIEngine = AIEngine;
