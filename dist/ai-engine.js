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
const chalk_1 = __importDefault(require("chalk"));
// Path to store the model
const modelDir = path_1.default.join(os_1.default.homedir(), '.code-caricature', 'models');
const modelName = 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
const modelPath = path_1.default.join(modelDir, modelName);
class AIEngine {
    static instance = null;
    /**
     * Check if Ollama is running locally
     */
    static async checkOllama() {
        try {
            const res = await fetch('http://localhost:11434/api/tags');
            return res.status === 200;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Query Ollama models and find the best suitable one
     */
    static async getOllamaModel() {
        try {
            const res = await fetch('http://localhost:11434/api/tags');
            if (res.status === 200) {
                const data = await res.json();
                if (data.models && data.models.length > 0) {
                    const names = data.models.map((m) => m.name);
                    const qwenCoder = names.find((n) => n.toLowerCase().includes('qwen2.5-coder') || n.toLowerCase().includes('qwen2.5-coder:1.5b'));
                    if (qwenCoder)
                        return qwenCoder;
                    const qwen = names.find((n) => n.toLowerCase().includes('qwen'));
                    if (qwen)
                        return qwen;
                    const coder = names.find((n) => n.toLowerCase().includes('coder'));
                    if (coder)
                        return coder;
                    return names[0];
                }
            }
        }
        catch (e) { }
        return 'qwen2.5-coder:1.5b'; // default fallback
    }
    /**
     * Initialize the local AI engine.
     * Checks for Ollama first, then falls back to node-llama-cpp if available.
     */
    static async init() {
        if (this.instance)
            return;
        // 1. Try Ollama first
        const ollamaRunning = await this.checkOllama();
        if (ollamaRunning) {
            const model = await this.getOllamaModel();
            this.instance = { type: 'ollama', model };
            return;
        }
        // 2. Fall back to node-llama-cpp if present
        try {
            const { getLlama } = await Function('return import("node-llama-cpp")')();
            if (!fs_1.default.existsSync(modelPath)) {
                console.log(chalk_1.default.yellow(`\n[!] Le modèle local n'a pas été trouvé à l'emplacement : ${modelPath}`));
                console.log(chalk_1.default.blue(`[+] Début du téléchargement automatique de Qwen2.5-Coder (environ 1.1 Go)...`));
                console.log(chalk_1.default.blue(`[+] Cette opération n'est effectuée qu'une seule fois.`));
                const modelUrl = 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
                await this.downloadModel(modelUrl, modelPath);
                console.log(chalk_1.default.green(`\n[+] Téléchargement terminé avec succès !`));
            }
            console.log(chalk_1.default.green(`[+] Initialisation du modèle local via node-llama-cpp (${modelName})...`));
            const llama = await getLlama();
            const model = await llama.loadModel({ modelPath });
            this.instance = { type: 'llama', model };
            return;
        }
        catch (e) {
            // Both failed
        }
        console.log(chalk_1.default.red(`\n[❌] Erreur : Aucun moteur d'IA locale disponible.`));
        console.log(chalk_1.default.yellow(`[!] Pour utiliser l'IA locale, veuillez au choix :`));
        console.log(chalk_1.default.yellow(`    1. Lancer Ollama localement (recommandé et très léger) :`));
        console.log(chalk_1.default.gray(`       - Téléchargez Ollama depuis https://ollama.com`));
        console.log(chalk_1.default.gray(`       - Lancez la commande suivante dans votre terminal :`));
        console.log(chalk_1.default.cyan(`         ollama run qwen2.5-coder:1.5b`));
        console.log(chalk_1.default.yellow(`    2. Ou réinstaller node-llama-cpp dans le projet :`));
        console.log(chalk_1.default.gray(`       - Exécutez : npm install node-llama-cpp@3.18.1`));
        throw new Error("Moteur d'IA locale indisponible (Ollama hors ligne et node-llama-cpp manquant).");
    }
    /**
     * Ask the local AI a question based on a given context (one-shot, no memory).
     */
    static async askLocalModel(systemPrompt, userPrompt) {
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
                const data = await response.json();
                return data.response;
            }
            catch (error) {
                console.error(chalk_1.default.red(`[❌] Erreur lors de l'appel à Ollama :`), error);
                throw error;
            }
        }
        else {
            const { LlamaChatSession } = await Function('return import("node-llama-cpp")')();
            const context = await this.instance.model.createContext();
            const session = new LlamaChatSession({
                contextSequence: context.getSequence(),
                systemPrompt: systemPrompt
            });
            console.log(chalk_1.default.gray(`[+] L'IA locale (node-llama-cpp) réfléchit...`));
            const response = await session.prompt(userPrompt);
            return response;
        }
    }
    /**
     * Create a persistent chat session (keeps memory between messages).
     * Used for the interactive mentor loop.
     */
    static async createSession(systemPrompt) {
        await this.init();
        if (this.instance.type === 'ollama') {
            const model = this.instance.model;
            const messages = [
                { role: 'system', content: systemPrompt }
            ];
            return {
                async chat(message) {
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
                        const data = await response.json();
                        const reply = data.message.content;
                        messages.push({ role: 'assistant', content: reply });
                        return reply;
                    }
                    catch (error) {
                        console.error(chalk_1.default.red(`[❌] Erreur lors du chat avec Ollama :`), error);
                        throw error;
                    }
                }
            };
        }
        else {
            const { LlamaChatSession } = await Function('return import("node-llama-cpp")')();
            const context = await this.instance.model.createContext();
            const session = new LlamaChatSession({
                contextSequence: context.getSequence(),
                systemPrompt: systemPrompt
            });
            return {
                async chat(message) {
                    return await session.prompt(message);
                }
            };
        }
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
