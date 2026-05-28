"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countTokens = countTokens;
const tiktoken_1 = require("tiktoken");
/**
 * Compte le nombre de tokens d'un texte pour un modèle donné
 * (par défaut gpt-4o, qui utilise o200k_base ou cl100k_base)
 */
function countTokens(text) {
    // cl100k_base est utilisé par GPT-4, GPT-3.5-turbo, etc.
    const enc = (0, tiktoken_1.get_encoding)("cl100k_base");
    try {
        const tokens = enc.encode(text);
        return tokens.length;
    }
    finally {
        enc.free(); // important pour libérer la mémoire WASM
    }
}
