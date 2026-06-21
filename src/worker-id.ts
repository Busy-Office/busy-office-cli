import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

// Stable worker name: SHA-256(email only), truncated to 12 hex chars.
// Email-only (no hostname) so the same person maps to the same worker row from any machine (ADR-37).
// Matches the workerName() export in contracts/index.mjs — keep in sync (ADR-42).

/** SHA-256(email, case-folded) → first 12 hex chars. Pure function, safe to unit-test. */
export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 12);
}

export function deriveWorkerId(): string {
  let email = 'unknown@busyoffice.local';
  try {
    email = execSync('git config user.email', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch { /* not in a git repo or no email config */ }
  return hashEmail(email);
}
