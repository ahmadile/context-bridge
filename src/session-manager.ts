/**
 * session-manager.ts
 * 
 * Gère la persistance et la restauration des sessions de chat et de tutoriel.
 * Les sessions sont enregistrées par projet, identifiées par un hash du dossier de travail (CWD).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const sessionDir = path.join(os.homedir(), '.code-caricature', 'sessions');

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionData {
  cwd: string;
  updatedAt: string;
  history: Message[];
}

/**
 * Generates a unique SHA-256 hash for the current working directory
 */
function getWorkspaceHash(): string {
  const cwd = process.cwd();
  return crypto.createHash('sha256').update(cwd).digest('hex');
}

/**
 * Saves a session history to disk
 */
export function saveSession(type: 'chat' | 'tutoriel', history: Message[]): void {
  try {
    const hash = getWorkspaceHash();
    const sessionPath = path.join(sessionDir, `${type}-${hash}.json`);
    
    fs.mkdirSync(sessionDir, { recursive: true });
    
    const data: SessionData = {
      cwd: process.cwd(),
      updatedAt: new Date().toISOString(),
      history
    };
    
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Loads a session history from disk
 */
export function loadSession(type: 'chat' | 'tutoriel'): Message[] | null {
  try {
    const hash = getWorkspaceHash();
    const sessionPath = path.join(sessionDir, `${type}-${hash}.json`);
    
    if (fs.existsSync(sessionPath)) {
      const raw = fs.readFileSync(sessionPath, 'utf8');
      const data: SessionData = JSON.parse(raw);
      
      // Verify that the session belongs to the same directory
      if (data.cwd === process.cwd()) {
        return data.history;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Deletes a session history
 */
export function deleteSession(type: 'chat' | 'tutoriel'): void {
  try {
    const hash = getWorkspaceHash();
    const sessionPath = path.join(sessionDir, `${type}-${hash}.json`);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  } catch (e) {}
}
