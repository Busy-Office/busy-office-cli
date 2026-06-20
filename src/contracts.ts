// Vendored mirror of contracts/index.mjs from github.com/ThePFMind/busy-office.
// Keep in sync with the canonical source — that file is the seam both repos share.
// When the main repo cuts a contracts change, update this file in the same PR/release.

export type WorkerState =
  | 'working' | 'waiting' | 'gate' | 'blocked'
  | 'meeting' | 'urgent'  | 'coffee' | 'walking';

export interface Envelope {
  ts: number;
  worker: string;
  type: string;
  task?: string;
  detail?: string;
  target?: string;
  gate?: { id: string; action?: string };
}

export const EVENT_TYPES: readonly string[] = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'Stop', 'Notification',
  'GatePending', 'Approved', 'Resolved', 'Adjourn',
  'Blocked', 'Error', 'RoundTable', 'Urgent', 'Escalation', 'Break',
];

export const EVENT_TO_STATE: Record<string, WorkerState> = {
  SessionStart: 'working',  UserPromptSubmit: 'working',
  PreToolUse: 'working',    PostToolUse: 'working',
  Approved: 'working',      Resolved: 'working',     Adjourn: 'working',
  Stop: 'waiting',
  GatePending: 'gate',      Notification: 'gate',
  Blocked: 'blocked',       Error: 'blocked',
  RoundTable: 'meeting',
  Urgent: 'urgent',         Escalation: 'urgent',
  Break: 'coffee',
};

export function stateOf(type: string): WorkerState | null {
  return EVENT_TO_STATE[type] ?? null;
}
