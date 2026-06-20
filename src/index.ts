#!/usr/bin/env node
import { Command } from 'commander';
import { init }    from './init.js';
import { emit }    from './emit.js';

const program = new Command()
  .name('busyoffice')
  .description('Busy Office CLI — wire Claude Code hooks and emit telemetry events')
  .version('0.1.0');

// ── busyoffice init ───────────────────────────────────────────────────────────
program
  .command('init')
  .description('Wire Claude Code hooks and save project credentials')
  .requiredOption('--ingest-url <url>', 'Ingest endpoint (SUPABASE_URL/functions/v1/ingest)')
  .requiredOption('--token <token>',    'Adapter token (from adapter_tokens table)')
  .option('--settings <path>',          'Path to .claude/settings.json (default: auto-detect)')
  .action((opts) => {
    init({ ingestUrl: opts.ingestUrl, token: opts.token, settingsPath: opts.settings });
  });

// ── busyoffice emit ───────────────────────────────────────────────────────────
program
  .command('emit')
  .description('Emit a telemetry event to the ingest endpoint (used by hooks)')
  .requiredOption('--type <type>',  'Event type (e.g. Stop, PreToolUse)')
  .option('--task <ref>',           'Task reference')
  .option('--detail <text>',        'Event detail / tool name')
  .option('--target <text>',        'Target (e.g. file path)')
  .option('--gate-id <id>',         'Gate ID (for GatePending events)')
  .action(async (opts) => {
    await emit({ type: opts.type, task: opts.task, detail: opts.detail, target: opts.target, gateId: opts.gateId });
  });

// ── busyoffice login ──────────────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate via Google SSO (available at beta)')
  .action(() => {
    console.log('SSO login is available from beta. For alpha, use --token with busyoffice init.');
    process.exit(0);
  });

program.parse();
