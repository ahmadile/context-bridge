/**
 * open-ai-engine.ts
 * Pont vers la Grande IA (OpenAI / ChatGPT).
 * Gère l'historique de conversation pour le mode mentorat interactif.
 */
import chalk from 'chalk';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenAIEngine {
  private history: ChatMessage[] = [];
  private client: any = null;
  private model: string;

  constructor(model: string = 'gpt-4o-mini') {
    this.model = model;
  }

  /**
   * Initialize the OpenAI client.
   * Returns false if no API key is found (so we can fallback to local).
   */
  async init(): Promise<boolean> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return false;
    }

    try {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({ apiKey });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Set the system prompt (the mentor's personality).
   * This is called once at the start of a tutoriel session.
   */
  setSystemPrompt(systemPrompt: string): void {
    this.history = [{ role: 'system', content: systemPrompt }];
  }

  /**
   * Send a message and get a response.
   * The conversation history is preserved between calls.
   */
  async chat(userMessage: string): Promise<string> {
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
    } catch (error: any) {
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
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  /**
   * Check if the engine is ready.
   */
  isReady(): boolean {
    return this.client !== null;
  }
}
