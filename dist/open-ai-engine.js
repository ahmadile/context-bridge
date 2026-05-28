"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIEngine = void 0;
class OpenAIEngine {
    history = [];
    client = null;
    model;
    constructor(model = 'gpt-4o-mini') {
        this.model = model;
    }
    /**
     * Initialize the OpenAI client.
     * Returns false if no API key is found (so we can fallback to local).
     */
    async init() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return false;
        }
        try {
            const { default: OpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
            this.client = new OpenAI({ apiKey });
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Set the system prompt (the mentor's personality).
     * This is called once at the start of a tutoriel session.
     */
    setSystemPrompt(systemPrompt) {
        this.history = [{ role: 'system', content: systemPrompt }];
    }
    /**
     * Send a message and get a response.
     * The conversation history is preserved between calls.
     */
    async chat(userMessage) {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }
        this.history.push({ role: 'user', content: userMessage });
        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: this.history,
                temperature: 0.7,
                max_tokens: 2048,
            });
            const assistantMessage = response.choices[0]?.message?.content || '';
            this.history.push({ role: 'assistant', content: assistantMessage });
            return assistantMessage;
        }
        catch (error) {
            // If quota exceeded or rate limited, throw so we can fallback
            if (error?.status === 429 || error?.code === 'insufficient_quota') {
                throw new Error('QUOTA_EXCEEDED');
            }
            throw error;
        }
    }
    /**
     * Get the current conversation history (useful for transferring to local AI).
     */
    getHistory() {
        return [...this.history];
    }
    /**
     * Check if the engine is ready.
     */
    isReady() {
        return this.client !== null;
    }
}
exports.OpenAIEngine = OpenAIEngine;
