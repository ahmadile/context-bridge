import { get_encoding } from 'tiktoken';

/**
 * Compte le nombre de tokens d'un texte pour un modèle donné
 * (par défaut gpt-4o, qui utilise o200k_base ou cl100k_base)
 */
export function countTokens(text: string): number {
    // cl100k_base est utilisé par GPT-4, GPT-3.5-turbo, etc.
    const enc = get_encoding("cl100k_base");
    try {
        const tokens = enc.encode(text);
        return tokens.length;
    } finally {
        enc.free(); // important pour libérer la mémoire WASM
    }
}
