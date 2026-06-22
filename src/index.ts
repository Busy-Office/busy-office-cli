#!/usr/bin/env node
import { Command } from 'commander';
import { init }    from './init.js';
import { emit }    from './emit.js';
import { login }   from './login.js';

const program = new Command()
  .name('busyoffice')
  .description('Busy Office CLI — wire Claude Code hooks and emit telemetry events')
  .version('0.1.0');

// ── busyoffice login ──────────────────────────────────────────────────────────
// Step 1 of first-run (ADR-50): authenticates via browser and stores credentials
// globally. Run once per machine from any directory.
program
  .command('login')
  .description('Authenticate via browser (run once per machine)')
  .option('--url <url>', 'Busy Office app URL', 'https://busy-office-staging.pages.dev')
  .action(async (opts) => {
    try {
      await login({ url: opts.url });
    } catch (err) {
      console.error(String(err));
      process.exit(1);
    }
  });

// ── busyoffice init ───────────────────────────────────────────────────────────
// Step 2 of first-run (ADR-50): wires Claude Code hooks into .claude/settings.json
// for the current project directory. Reads stored credentials — no flags needed
// after `busyoffice login`. Run once per project, from the project root.
program
  .command('init')
  .description('Wire Claude Code hooks for this project (run from project root)')
  .option('--ingest-url <url>', 'Ingest endpoint override (skips stored credentials)')
  .option('--token <token>',    'Adapter token override (skips stored credentials)')
  .option('--settings <path>',  'Path to .claude/settings.json (default: auto-detect)')
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

program.parse();
