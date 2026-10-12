import { expect, mock, test } from 'claude-code/testing';

import type { On, SessionRateLimit } from 'claude-code';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const CONTEXT = { window: 200_000 };
const PATH = '/Users/me/.claude/usage-bar.json';

const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 83, resetsAt: '2026-10-08T12:18:00Z' },
  { kind: 'seven_day', percentUsed: 63, resetsAt: '2026-10-13T13:00:00Z' },
];

const engine = (
  on: On,
  rateLimits: SessionRateLimit[],
  { env = { HOME: '/Users/me' }, existing = [] }: { env?: Record<string, string>; existing?: string[] } = {},
) => {
  const writes: { path: string; text: string }[] = [];

  mock.clock(on, { now: NOW });
  mock.env(on, env);
  on('fs.exists', (_$, e) => ({ value: existing.includes(e.path) }));
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text });

    return { value: undefined };
  });
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('session.usage', () => ({ value: { startedAt: NOW, context: CONTEXT, rateLimits } }));
  on('session.measure', (_$, e) => ({ changed: e.changed }));

  return writes;
};

const START = { cwd: '/', surface: 'vscode', isInteractive: true } as const;

test('writes the reading when a session starts and when the limits move', async ($, on) => {
  const writes = engine(on, LIMITS);

  await $.session.start(START);
  expect(writes).toEqual([{ path: PATH, text: JSON.stringify({ version: 1, updatedAt: NOW, limits: LIMITS }) }]);

  const moved = [{ ...LIMITS[0], percentUsed: 84 }, LIMITS[1]] as SessionRateLimit[];
  await $.session.measure({ context: CONTEXT, rateLimits: moved, changed: ['rateLimits'] });
  expect(writes.at(-1)).toEqual({ path: PATH, text: JSON.stringify({ version: 1, updatedAt: NOW, limits: moved }) });
});

test('leaves a reading that is there when a session starts, since another chat may have written it since', async ($, on) => {
  const writes = engine(on, LIMITS, { existing: [PATH] });

  await $.session.start(START);
  expect(writes).toEqual([]);
});

test('never overwrites a reading with an empty one, or when only the context moved', async ($, on) => {
  const writes = engine(on, []);

  await $.session.start(START);
  await $.session.measure({ context: CONTEXT, rateLimits: [], changed: ['rateLimits'] });
  await $.session.measure({ context: CONTEXT, rateLimits: LIMITS, changed: ['context'] });
  expect(writes).toEqual([]);
});

// Node's home folder, where the extension reads, is USERPROFILE on Windows and HOME elsewhere, whatever else is set
test('writes to the user profile on Windows, even with a HOME set', async ($, on) => {
  const writes = engine(on, LIMITS, { env: { OS: 'Windows_NT', HOME: '/home/me', USERPROFILE: '/profiles/me' } });

  await $.session.start(START);
  expect(writes.map(w => w.path)).toEqual(['/profiles/me/.claude/usage-bar.json']);
});

test('writes to HOME elsewhere, even with a USERPROFILE passed through from Windows, as WSL can', async ($, on) => {
  const writes = engine(on, LIMITS, { env: { HOME: '/home/me', USERPROFILE: '/mnt/c/Users/me' } });

  await $.session.start(START);
  expect(writes.map(w => w.path)).toEqual(['/home/me/.claude/usage-bar.json']);
});

test('writes nothing for a home folder that is empty or relative', async ($, on) => {
  const writes = engine(on, LIMITS, { env: { HOME: 'me' } });

  await $.session.start(START);
  await $.session.measure({ context: CONTEXT, rateLimits: LIMITS, changed: ['rateLimits'] });
  expect(writes).toEqual([]);
});
