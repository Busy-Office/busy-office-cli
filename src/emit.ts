import { readConfig } from './config.js';
import { EVENT_TYPES, type Envelope } from './contracts.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOG_FILE = join(homedir(), '.config', 'busyoffice', 'emit.log');

/**
 * Read all data from stdin as JSON.
 * Returns null immediately if stdin is a TTY (no pipe), on timeout, or on parse error.
 * Must not throw.
 */
export async function readStdinJson(): Promise<Record<string, unknown> | null> {
  if (process.stdin.isTTY) return null;

  return new Promise<Record<string, unknown> | null>((resolve) => {
    let raw = '';
    const timer = setTimeout(() => {
      process.stdin.destroy();
      resolve(null);
    }, 500);

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk: string) => {
      raw += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          resolve(parsed as Record<string, unknown>);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });

    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * Derive enriched detail and target from Claude Code hook stdin JSON.
 * Explicit CLI args always win over stdin-derived values.
 * Exported for unit testing.
 */
export function enrichFromHookInput(
  args: { detail?: string; target?: string },
  hookInput: Record<string, unknown> | null,
): { detail: string | undefined; target: string | undefined } {
  if (!hookInput) {
    return { detail: args.detail, target: args.target };
  }

  const toolInput =
    hookInput.tool_input !== null &&
    typeof hookInput.tool_input === 'object' &&
    !Array.isArray(hookInput.tool_input)
      ? (hookInput.tool_input as Record<string, unknown>)
      : null;

  const stdinDetail =
    (typeof hookInput.tool_name === 'string' ? hookInput.tool_name : undefined) ??
    (typeof hookInput.message === 'string' ? hookInput.message.slice(0, 200) : undefined) ??
    (typeof hookInput.prompt === 'string' ? hookInput.prompt.slice(0, 200) : undefined);

  const stdinTarget = toolInput
    ? (typeof toolInput.path === 'string' ? toolInput.path : undefined) ??
      (typeof toolInput.command === 'string' ? toolInput.command.slice(0, 200) : undefined) ??
      (typeof toolInput.description === 'string' ? toolInput.description.slice(0, 200) : undefined)
    : undefined;

  return {
    detail: args.detail ?? stdinDetail,
    target: args.target ?? stdinTarget,
  };
}

// Emit an event envelope to the ingest endpoint.
// Exits 0 on ANY error — hooks must never disrupt Claude Code output (PRN-02).
export async function emit(args: {
  type: string;
  task?: string;
  detail?: string;
  target?: string;
  gateId?: string;
}): Promise<void> {
  // Drain stdin BEFORE the config check so we never leave a broken pipe in Claude Code.
  const hookInput = await readStdinJson();
  const { detail, target } = enrichFromHookInput(args, hookInput);

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
      ...(args.task && { task:   args.task }),
      ...(detail    && { detail }),
      ...(target    && { target }),
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
