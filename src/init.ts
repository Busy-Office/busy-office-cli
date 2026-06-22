import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { URL } from 'node:url';
import { readConfig, readFullConfig } from './config.js';

// Claude Code hook events busyoffice wires (Ian's spec, ADR-02 / PRN-02, ADR-50).
// Each hook prefixes BUSYOFFICE_PROJECT=<host> so emit() resolves the right credentials
// when multiple projects share the same machine (ADR-50 multi-project config).
const HOOK_TYPES = ['PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit', 'Notification'] as const;

interface HookEntry { type: 'command'; command: string }
type HooksConfig = Partial<Record<string, HookEntry[]>>;
interface ClaudeSettings { hooks?: HooksConfig; [k: string]: unknown }

export interface InitOpts {
  ingestUrl?: string;   // explicit override (manual flow or backward compat)
  token?: string;       // explicit override
  settingsPath?: string;
}

export function init(opts: InitOpts = {}): void {
  // Resolve credentials: explicit flags > stored config.
  let ingestUrl = opts.ingestUrl;
  let token = opts.token;
  let host: string;

  if (ingestUrl && token) {
    // Manual mode (backward compat / CI use).
    try { host = new URL(ingestUrl).hostname; } catch { host = 'unknown'; }
  } else {
    // Login mode: read from stored config (ADR-50).
    const full = readFullConfig();
    if (!full) {
      console.error('No credentials found. Run `busyoffice login` first.');
      process.exit(1);
    }
    host = full.default ?? Object.keys(full.projects)[0] ?? 'unknown';
    const proj = readConfig(host);
    if (!proj) {
      console.error(`No credentials for project "${host}". Run \`busyoffice login\` first.`);
      process.exit(1);
    }
    ingestUrl = proj.ingestUrl;
    token = proj.token;
  }

  // Wire hooks into .claude/settings.json.
  const settingsPath = opts.settingsPath ?? join(process.cwd(), '.claude', 'settings.json');
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { /* start fresh */ }
  }

  const hooks: HooksConfig = settings.hooks ?? {};
  for (const eventType of HOOK_TYPES) {
    // Prefix BUSYOFFICE_PROJECT so emit() resolves the right project credentials (ADR-50).
    const cmd = `BUSYOFFICE_PROJECT=${host} busyoffice emit --type ${eventType}`;
    const entry: HookEntry = { type: 'command', command: cmd };
    const existing = hooks[eventType] ?? [];
    // Replace any existing busyoffice emit hook (handles re-init / project switch).
    const without = existing.filter(h => !h.command?.includes('busyoffice emit'));
    hooks[eventType] = [...without, entry];
  }
  settings.hooks = hooks;

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`✓ Hooks wired in: ${settingsPath}`);
  console.log(`✓ Project: ${host}`);
  console.log('Claude Code will now send telemetry to Busy Office automatically.');
}
