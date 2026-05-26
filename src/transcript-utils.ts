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
export interface TranscriptSegment {
  index: number;
  title: string;
  text: string;
  charCount: number;
  score: number;
}

const ACTION_KEYWORDS =
  /\b(install|npm|yarn|pnpm|create|fichier|file|code|étape|step|commande|run|build|import|export|function|class|composant|component|erreur|fix|corriger|ajouter|modifier|mkdir|terminal|cursor|vscode)\b/gi;

/**
 * Découpe une transcription en segments (~taille cible) pour choisir par où commencer.
 */
export function segmentTranscript(
  transcript: string,
  targetChunkChars: number = 4500
): TranscriptSegment[] {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  const timestampSplitRe = /(?=(?:\n|^)(?:\[\d{1,2}:\d{2}(?::\d{2})?\]|\d{1,2}:\d{2}(?::\d{2})?)[\s:])/m;
  const timestampBlocks = trimmed.split(timestampSplitRe);

  let rawParts: string[] =
    timestampBlocks.length > 1
      ? timestampBlocks.filter((p) => p.trim().length > 80)
      : trimmed.split(/\n{2,}/).filter((p) => p.trim().length > 40);

  if (rawParts.length <= 1 && trimmed.length > targetChunkChars) {
    rawParts = [];
    for (let i = 0; i < trimmed.length; i += targetChunkChars) {
      rawParts.push(trimmed.slice(i, i + targetChunkChars));
    }
  }

  const segments: TranscriptSegment[] = [];
  let buffer = '';
  let segIndex = 0;

  const flush = () => {
    const text = buffer.trim();
    if (!text) return;
    const firstLine = text.split('\n').find((l) => l.trim()) || `Partie ${segIndex + 1}`;
    const title =
      firstLine.length > 72 ? firstLine.slice(0, 69) + '…' : firstLine;
    const matches = text.match(ACTION_KEYWORDS);
    const score = (matches?.length || 0) + (text.length < targetChunkChars * 1.5 ? 2 : 0);
    segments.push({
      index: segIndex++,
      title,
      text,
      charCount: text.length,
      score,
    });
    buffer = '';
  };

  for (const part of rawParts) {
    if (buffer.length + part.length > targetChunkChars && buffer.length > 0) {
      flush();
    }
    buffer += (buffer ? '\n\n' : '') + part;
  }
  flush();

  if (segments.length === 0) {
    segments.push({
      index: 0,
      title: 'Transcription complète',
      text: trimmed,
      charCount: trimmed.length,
      score: 0,
    });
  }

  return segments;
}

/**
 * Choisit le meilleur segment de départ (contenu « actionnable »).
 */
export function suggestBestSegmentIndex(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 0;
  let best = 0;
  let bestScore = segments[0].score;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].score > bestScore) {
      bestScore = segments[i].score;
      best = i;
    }
  }
  return best;
}

/**
 * Prépare le texte d'une transcription à partir d'un segment choisi (+ contexte suivant limité).
 */
export function buildTranscriptFromSegment(
  segments: TranscriptSegment[],
  startIndex: number,
  maxChars: number = LOCAL_TRANSCRIPT_MAX_CHARS
): string {
  if (segments.length === 0) return '';
  const start = Math.max(0, Math.min(startIndex, segments.length - 1));
  let combined = `=== Début du tutoriel (partie ${start + 1}/${segments.length}) ===\n\n`;
  combined += segments[start].text;

  for (let i = start + 1; i < segments.length && combined.length < maxChars; i++) {
    const next = `\n\n=== Suite (partie ${i + 1}/${segments.length}) ===\n\n${segments[i].text}`;
    if (combined.length + next.length > maxChars) {
      combined += `\n\n[… ${segments.length - i} partie(s) suivante(s) non incluses dans ce bloc — demandez « étape suivante » au mentor …]`;
      break;
    }
    combined += next;
  }

  if (combined.length > maxChars) {
    return prepareTranscriptForLocal(combined, maxChars).excerpt;
  }
  return combined;
}

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
