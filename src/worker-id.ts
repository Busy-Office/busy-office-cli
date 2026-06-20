import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { hostname } from 'node:os';

// Stable worker ID: SHA-256(hostname + git user.email), truncated to 12 hex chars.
// Deterministic per machine+user — two people on the same project won't collide (ADR-34).
export function deriveWorkerId(): string {
  let email = 'unknown';
  try {
    email = execSync('git config user.email', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch { /* not in a git repo or no config — use hostname only */ }

  return createHash('sha256')
    .update(`${hostname()}::${email}`)
    .digest('hex')
    .slice(0, 12);
}
