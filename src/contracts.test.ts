// Unit tests for the vendored contracts mirror (contracts.ts).
// Verifies parity with canonical contracts/index.mjs (ADR-42 requirement).
// Run via: pnpm test (builds first, then node --test dist/**/*.test.js)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES, EVENT_TO_STATE, stateOf } from './contracts.js';
import { enrichFromHookInput } from './emit.js';

describe('contracts mirror — parity with canonical contracts/index.mjs', () => {
  it('every EVENT_TYPE maps to a worker state', () => {
    for (const t of EVENT_TYPES) {
      assert.ok(stateOf(t), `"${t}" must map to a WorkerState`);
    }
  });

  it('canonical event count is 16 — fail fast on mirror drift', () => {
    assert.equal(EVENT_TYPES.length, 16);
  });

  it('critical state mappings match canonical', () => {
    assert.equal(stateOf('GatePending'),    'gate',    'gate-pending → gate');
    assert.equal(stateOf('Approved'),       'working', 'approved resumes work');
    assert.equal(stateOf('Blocked'),        'blocked', 'blocked');
    assert.equal(stateOf('Stop'),           'waiting', 'stop → waiting');
    assert.equal(stateOf('Escalation'),     'urgent',  'escalation → urgent');
    assert.equal(stateOf('Break'),          'coffee',  'break → coffee');
    assert.equal(stateOf('RoundTable'),     'meeting', 'round-table → meeting');
    assert.equal(stateOf('PreToolUse'),     'working', 'pre-tool → working');
    assert.equal(stateOf('SessionStart'),   'working', 'session-start → working');
  });

  it('unknown type returns null (caller ignores)', () => {
    assert.equal(stateOf('Unknown'), null);
    assert.equal(stateOf(''),        null);
  });

  it('EVENT_TO_STATE covers all EVENT_TYPES', () => {
    for (const t of EVENT_TYPES) {
      assert.ok(t in EVENT_TO_STATE, `${t} missing from EVENT_TO_STATE`);
    }
  });
});

describe('emit stdin enrichment', () => {
  it('PreToolUse with tool_name and path from stdin', () => {
    const hookInput: Record<string, unknown> = {
      hook_event_name: 'PreToolUse',
      session_id: 'sess-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la', path: '/home/user/project' },
    };

    const result = enrichFromHookInput({}, hookInput);

    assert.equal(result.detail, 'Bash', 'detail should be tool_name');
    assert.equal(result.target, '/home/user/project', 'target should be path from tool_input');
  });

  it('Notification with message from stdin', () => {
    const hookInput: Record<string, unknown> = {
      hook_event_name: 'Notification',
      session_id: 'sess-2',
      message: 'Build completed successfully',
    };

    const result = enrichFromHookInput({}, hookInput);

    assert.equal(result.detail, 'Build completed successfully', 'detail should be message');
    assert.equal(result.target, undefined, 'target should be undefined when no tool_input');
  });

  it('explicit --detail overrides stdin', () => {
    const hookInput: Record<string, unknown> = {
      hook_event_name: 'PreToolUse',
      session_id: 'sess-3',
      tool_name: 'Read',
      tool_input: { path: '/some/file.ts' },
    };

    const result = enrichFromHookInput({ detail: 'my-explicit-detail', target: 'explicit-target' }, hookInput);

    assert.equal(result.detail, 'my-explicit-detail', 'explicit detail should win over stdin tool_name');
    assert.equal(result.target, 'explicit-target', 'explicit target should win over stdin path');
  });

  it('malformed stdin JSON → null, no crash', () => {
    // null hookInput simulates malformed/unparseable stdin
    const result = enrichFromHookInput({}, null);

    assert.equal(result.detail, undefined, 'detail should be undefined with null hookInput');
    assert.equal(result.target, undefined, 'target should be undefined with null hookInput');
  });

  it('TTY stdin → null, no enrichment', () => {
    // null hookInput simulates what readStdinJson() returns for TTY
    const result = enrichFromHookInput({}, null);

    // No stdin enrichment when isTTY (hookInput is null)
    assert.equal(result.detail, undefined, 'no detail without stdin or explicit arg');
    assert.equal(result.target, undefined, 'no target without stdin or explicit arg');
  });

  it('message truncated to 200 chars', () => {
    const longMessage = 'x'.repeat(300);
    const hookInput: Record<string, unknown> = {
      hook_event_name: 'Notification',
      session_id: 'sess-4',
      message: longMessage,
    };

    const result = enrichFromHookInput({}, hookInput);

    assert.equal(result.detail?.length, 200, 'message should be truncated to 200 chars');
  });

  it('prompt from UserPromptSubmit used as detail', () => {
    const hookInput: Record<string, unknown> = {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'sess-5',
      prompt: 'Fix the bug in auth module',
    };

    const result = enrichFromHookInput({}, hookInput);

    assert.equal(result.detail, 'Fix the bug in auth module', 'detail should be prompt text');
  });

  it('command from tool_input used as target when no path', () => {
    const hookInput: Record<string, unknown> = {
      hook_event_name: 'PreToolUse',
      session_id: 'sess-6',
      tool_name: 'Bash',
      tool_input: { command: 'npm install' },
    };

    const result = enrichFromHookInput({}, hookInput);

    assert.equal(result.detail, 'Bash', 'detail is tool_name');
    assert.equal(result.target, 'npm install', 'target falls back to command when no path');
  });
});
