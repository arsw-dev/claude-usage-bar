import { expect, mock, test } from 'claude-code/testing';

import type { On, SessionRateLimit } from 'claude-code';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const CONTEXT = { window: 200_000 };
const PATH = '/Users/me/.claude/usage-bar.json';

const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 83, resetsAt: '2026-10-08T12:18:00Z' },
  { kind: 'seven_day', percentUsed: 63, resetsAt: '2026-10-13T13:00:00Z' },
];

const engine = (on: On, rateLimits: SessionRateLimit[], env: Record<string, string> = { HOME: '/Users/me' }) => {
  const writes: { path: string; text: string }[] = [];

  mock.clock(on, { now: NOW });
  mock.env(on, env);
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text });

    return { value: undefined };
  });
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('session.usage', () => ({ value: { startedAt: NOW, context: CONTEXT, rateLimits } }));
  on('session.measure', (_$, e) => ({ changed: e.changed }));

  return writes;
};

test('writes the reading when a session starts and when the limits move', async ($, on) => {
  const writes = engine(on, LIMITS);

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true });
  expect(writes).toEqual([{ path: PATH, text: JSON.stringify({ version: 1, updatedAt: NOW, limits: LIMITS }) }]);

  const moved = [{ ...LIMITS[0], percentUsed: 84 }, LIMITS[1]] as SessionRateLimit[];
  await $.session.measure({ context: CONTEXT, rateLimits: moved, changed: ['rateLimits'] });
  expect(writes.at(-1)).toEqual({ path: PATH, text: JSON.stringify({ version: 1, updatedAt: NOW, limits: moved }) });
});

test('never overwrites a reading with an empty one, or when only the context moved', async ($, on) => {
  const writes = engine(on, []);

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true });
  await $.session.measure({ context: CONTEXT, rateLimits: [], changed: ['rateLimits'] });
  await $.session.measure({ context: CONTEXT, rateLimits: LIMITS, changed: ['context'] });
  expect(writes).toEqual([]);
});

test('writes to the user profile on Windows, which has no HOME', async ($, on) => {
  const writes = engine(on, LIMITS, { USERPROFILE: '/profiles/me' });

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true });
  expect(writes.map(w => w.path)).toEqual(['/profiles/me/.claude/usage-bar.json']);
});
