/**
 * Utilitaires pour adapter les longues transcriptions au contexte limité
 * des modèles locaux (Qwen 1.5B ~ quelques milliers de tokens utiles).
 */

/** Taille max recommandée pour le prompt système local (caractères). */
export const LOCAL_TRANSCRIPT_MAX_CHARS = 6000;

export interface PreparedTranscript {
  excerpt: string;
  truncated: boolean;
  fullLength: number;
}

/**
 * Réduit une transcription pour l'IA locale : début + fin + note explicative.
 */
export function prepareTranscriptForLocal(
  transcript: string,
  maxChars: number = LOCAL_TRANSCRIPT_MAX_CHARS
): PreparedTranscript {
  const trimmed = transcript.trim();
  const fullLength = trimmed.length;

  if (fullLength <= maxChars) {
    return { excerpt: trimmed, truncated: false, fullLength };
  }

  const headSize = Math.floor(maxChars * 0.55);
  const tailSize = Math.floor(maxChars * 0.35);
  const head = trimmed.slice(0, headSize);
  const tail = trimmed.slice(-tailSize);

  const excerpt =
    `${head}\n\n` +
    `[… transcription tronquée pour le modèle local : ${fullLength.toLocaleString()} caractères au total, ` +
    `${(fullLength - headSize - tailSize).toLocaleString()} caractères omis au milieu …]\n\n` +
    `${tail}\n\n` +
    `NOTE POUR L'IA : La transcription complète existe côté application. ` +
    `Guide l'utilisateur étape par étape. Si une section manque, demande à l'utilisateur ` +
    `de préciser l'étape ou le sujet (ex. "npm install", "créer le fichier X").`;

  return { excerpt, truncated: true, fullLength };
}

/**
 * Extrait un passage pertinent de la transcription selon des mots-clés.
 */
export function findTranscriptExcerpt(
  transcript: string,
  query: string,
  windowChars: number = 2500
): string | null {
  const lower = transcript.toLowerCase();
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);

  for (const word of words) {
    const idx = lower.indexOf(word);
    if (idx >= 0) {
      const start = Math.max(0, idx - Math.floor(windowChars / 2));
      const end = Math.min(transcript.length, start + windowChars);
      return transcript.slice(start, end);
    }
  }
  return null;
}

/**
 * Limite l'historique injecté dans le contexte local.
 */
export function compactHistoryForLocal(
  history: { role: string; content: string }[],
  maxMessages: number = 8,
  maxCharsPerMessage: number = 600
): string {
  const recent = history.slice(-maxMessages);
  return recent
    .map((m) => {
      const role = m.role === 'user' ? 'Utilisateur' : 'Assistant';
      const content =
        m.content.length > maxCharsPerMessage
          ? m.content.slice(0, maxCharsPerMessage) + '…'
          : m.content;
      return `${role}: ${content}`;
    })
    .join('\n');
}
