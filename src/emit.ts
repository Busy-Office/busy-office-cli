import { readConfig } from './config.js';
import { EVENT_TYPES, type Envelope } from './contracts.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOG_FILE = join(homedir(), '.config', 'busyoffice', 'emit.log');

// Emit an event envelope to the ingest endpoint.
// Exits 0 on ANY error — hooks must never disrupt Claude Code output (PRN-02).
export async function emit(args: {
  type: string;
  task?: string;
  detail?: string;
  target?: string;
  gateId?: string;
}): Promise<void> {
  try {
    const config = readConfig();
    if (!config) return logAndExit('no config — run busyoffice init first');

    if (!EVENT_TYPES.includes(args.type)) {
      return logAndExit(`unknown event type: ${args.type}`);
    }

    const envelope: Envelope = {
      ts:     Math.floor(Date.now() / 1000),
      worker: config.workerId,
      type:   args.type,
      ...(args.task   && { task:   args.task }),
      ...(args.detail && { detail: args.detail }),
      ...(args.target && { target: args.target }),
      ...(args.gateId && { gate: { id: args.gateId } }),
    };

    const res = await fetch(config.ingestUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logAndExit(`ingest ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    logAndExit(String(err));
  }
}

function logAndExit(msg: string): void {
  try {
    mkdirSync(join(homedir(), '.config', 'busyoffice'), { recursive: true });
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* ignore log failures */ }
  process.exit(0); // always exit 0 — never break the hook chain
}
