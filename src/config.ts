import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR  = join(homedir(), '.config', 'busyoffice');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Per-project credentials, keyed by Supabase hostname in the global config.
export interface ProjectConfig {
  ingestUrl: string;  // https://<host>/functions/v1/ingest
  token: string;      // raw adapter token (never stored in tracked files)
}

// Global config (ADR-50): host-keyed so multiple projects can coexist.
// Backward-compat: the old flat format { ingestUrl, token, workerId } is read
// transparently and treated as a single "default" project.
export interface Config {
  projects: Record<string, ProjectConfig>;
  workerId: string;
  default?: string;  // hostname of the last-used project
}

/** Return credentials for the given Supabase hostname (or `default` if omitted). */
export function readConfig(host?: string): ProjectConfig | null {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;

    // Backward compat: old flat format { ingestUrl, token, workerId }
    if (typeof raw.ingestUrl === 'string' && typeof raw.token === 'string') {
      return { ingestUrl: raw.ingestUrl, token: raw.token };
    }

    const cfg = raw as unknown as Config;
    const targetHost = host ?? cfg.default;
    if (!targetHost) return null;
    return cfg.projects?.[targetHost] ?? null;
  } catch {
    return null;
  }
}

/** Read the full config (for workerId, project list, etc.). */
export function readFullConfig(): Config | null {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;

    // Backward compat: migrate flat format on read
    if (typeof raw.ingestUrl === 'string' && typeof raw.token === 'string') {
      const host = new URL(raw.ingestUrl as string).hostname;
      return {
        projects: { [host]: { ingestUrl: raw.ingestUrl as string, token: raw.token as string } },
        workerId: (raw.workerId as string) ?? 'unknown',
        default: host,
      };
    }

    return raw as unknown as Config;
  } catch {
    return null;
  }
}

/** Save credentials for a project (upsert by host). Updates `default` to this host. */
export function writeProjectConfig(opts: {
  host: string;
  ingestUrl: string;
  token: string;
  workerId: string;
}): void {
  mkdirSync(CONFIG_DIR, { recursive: true });

  const existing = readFullConfig() ?? { projects: {}, workerId: opts.workerId };
  const updated: Config = {
    projects: {
      ...existing.projects,
      [opts.host]: { ingestUrl: opts.ingestUrl, token: opts.token },
    },
    workerId: opts.workerId,
    default: opts.host,
  };

  writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
}

/** Legacy helper — kept for callers that pre-date host-keying. */
export function writeConfig(config: { ingestUrl: string; token: string; workerId: string }): void {
  const host = (() => {
    try { return new URL(config.ingestUrl).hostname; } catch { return 'unknown'; }
  })();
  writeProjectConfig({ host, ...config });
}
