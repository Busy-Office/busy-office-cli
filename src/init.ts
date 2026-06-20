import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeConfig } from './config.js';
import { deriveWorkerId } from './worker-id.js';

// The five Claude Code hook events busyoffice wires (Ian's spec, ADR-34 / PRN-02).
// Each runs `busyoffice emit --type <event> --detail "$HOOK_INPUT"` silently.
const HOOKS: Record<string, string[]> = {
  PreToolUse:      ['busyoffice', 'emit', '--type', 'PreToolUse'],
  PostToolUse:     ['busyoffice', 'emit', '--type', 'PostToolUse'],
  Stop:            ['busyoffice', 'emit', '--type', 'Stop'],
  UserPromptSubmit:['busyoffice', 'emit', '--type', 'UserPromptSubmit'],
  Notification:    ['busyoffice', 'emit', '--type', 'Notification'],
};

interface HookEntry { type: 'command'; command: string }
type HooksConfig = Partial<Record<string, HookEntry[]>>;
interface ClaudeSettings { hooks?: HooksConfig; [k: string]: unknown }

export function init(opts: { ingestUrl: string; token: string; settingsPath?: string }): void {
  const workerId = deriveWorkerId();

  // 1. Save config to ~/.config/busyoffice/config.json
  writeConfig({ ingestUrl: opts.ingestUrl, token: opts.token, workerId });

  // 2. Wire hooks into .claude/settings.json (create if absent)
  const settingsPath = opts.settingsPath ?? join(process.cwd(), '.claude', 'settings.json');
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { /* start fresh */ }
  }

  const hooks: HooksConfig = settings.hooks ?? {};
  for (const [event, cmd] of Object.entries(HOOKS)) {
    const entry: HookEntry = { type: 'command', command: cmd.join(' ') };
    const existing = hooks[event] ?? [];
    // Don't double-add if already wired.
    if (!existing.some(h => h.command?.includes('busyoffice emit'))) {
      hooks[event] = [...existing, entry];
    }
  }
  settings.hooks = hooks;

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`✓ Worker ID: ${workerId}`);
  console.log(`✓ Hooks wired in: ${settingsPath}`);
  console.log(`✓ Config saved to: ~/.config/busyoffice/config.json`);
}
