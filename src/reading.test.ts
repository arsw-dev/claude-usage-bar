import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { readReading } from './reading.ts';

const LIMITS = [
  { kind: 'five_hour', percentUsed: 62, resetsAt: '2026-10-09T04:50:00.000Z' },
  { kind: 'seven_day', percentUsed: 73, resetsAt: '2026-10-14T01:00:00.000Z' },
];

describe('readReading', () => {
  let dir = '';

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'reading-'));
  });

  after(async () => {
    await rm(dir, { recursive: true });
  });

  const written = async (text: string) => {
    const path = join(dir, `${crypto.randomUUID()}.json`);

    await writeFile(path, text);

    return path;
  };

  const withLimits = (limits: unknown[]) => written(JSON.stringify({ version: 1, updatedAt: 1, limits }));

  it('reads the windows and when they were reported', async () => {
    const path = await written(JSON.stringify({ version: 1, updatedAt: 1_791_514_763_510, limits: LIMITS }));

    assert.deepEqual(await readReading(path), { updatedAt: 1_791_514_763_510, limits: LIMITS });
  });

  it('has no reading before the plugin has written one', async () => {
    assert.equal(await readReading(join(dir, 'missing.json')), undefined);
  });

  it('has no reading from a file caught mid-write', async () => {
    assert.equal(await readReading(await written('{"version":1,"updatedAt":17915')), undefined);
  });

  it('leaves a reading in another version unread', async () => {
    const newer = await written(JSON.stringify({ version: 2, updatedAt: 1, limits: LIMITS }));
    const unversioned = await written(JSON.stringify({ updatedAt: 1, limits: LIMITS }));

    assert.equal(await readReading(newer), undefined);
    assert.equal(await readReading(unversioned), undefined);
  });

  it('leaves a reading unread that could draw something other than usage', async () => {
    const window = LIMITS[0];

    assert.equal(await readReading(await withLimits([{ ...window, kind: '$(sync~spin) Installing' }])), undefined);
    assert.equal(await readReading(await withLimits([{ ...window, kind: 'x'.repeat(41) }])), undefined);
    assert.equal(await readReading(await withLimits([{ ...window, percentUsed: 1e300 }])), undefined);
    assert.equal(await readReading(await withLimits([{ ...window, percentUsed: -5 }])), undefined);
    assert.equal(await readReading(await withLimits(Array.from({ length: 9 }, () => window))), undefined);
  });
});
