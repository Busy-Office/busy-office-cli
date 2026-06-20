import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR  = join(homedir(), '.config', 'busyoffice');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface Config {
  ingestUrl: string;   // https://<project>.supabase.co/functions/v1/ingest
  token: string;       // raw adapter token (never stored in tracked files)
  workerId: string;    // stable hash of hostname + git user.email
}

export function readConfig(): Config | null {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Config;
  } catch {
    return null;
  }
}

export function writeConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}
