import fs from 'fs';
import path from 'path';

/**
 * Single source of truth for the CLI version.
 * Reads it from package.json at runtime (works from dist/ too).
 */
export function getPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

