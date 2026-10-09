import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bar, countdown, windowViewsOf } from './view.ts';

import type { Reading } from './view.ts';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const MINUTE = 60_000;

const reading = (fiveHour: number, sevenDay: number): Reading => ({
  updatedAt: NOW - 2 * MINUTE,
  limits: [
    { kind: 'seven_day', percentUsed: sevenDay, resetsAt: '2026-10-13T13:00:00Z' },
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: '2026-10-08T12:18:00Z' },
  ],
});

const levels = (fiveHour: number, sevenDay: number) =>
  windowViewsOf(reading(fiveHour, sevenDay), NOW).map(view => view.level);

describe('bar', () => {
  it('fills a cell per 10%, rounded, and never spills', () => {
    assert.equal(bar(0), '▱▱▱▱▱▱▱▱▱▱');
    assert.equal(bar(83), '▰▰▰▰▰▰▰▰▱▱');
    assert.equal(bar(86), '▰▰▰▰▰▰▰▰▰▱');
    assert.equal(bar(130), '▰▰▰▰▰▰▰▰▰▰');
  });
});

describe('countdown', () => {
  it('reads in minutes, then hours and minutes, then days and hours', () => {
    assert.equal(countdown(10_000), '1m');
    assert.equal(countdown(18 * MINUTE), '18m');
    assert.equal(countdown(100 * MINUTE), '1h 40m');
    assert.equal(countdown((5 * 24 + 1) * 60 * MINUTE), '5d 1h');
  });

  it('rounds up to the next minute, and into hours at 60', () => {
    assert.equal(countdown(17.5 * MINUTE), '18m');
    assert.equal(countdown(59.5 * MINUTE), '1h 0m');
  });
});

describe('windowViewsOf', () => {
  it('shows the 5-hour window first, then the week, each with when Claude Code reported', () => {
    const [fiveHour, sevenDay] = windowViewsOf(reading(83, 63), NOW);

    assert.deepEqual(fiveHour, {
      kind: 'five_hour',
      name: '5-Hour Window',
      order: 0,
      text: '5h ▰▰▰▰▰▰▰▰▱▱ 83% · 18m',
      tooltip: '5-hour window: 83% used, resets in 18m\nUpdated 2m ago by Claude Code',
      level: 'warning',
    });
    assert.deepEqual(sevenDay, {
      kind: 'seven_day',
      name: 'Weekly',
      order: 1,
      text: '7d ▰▰▰▰▰▰▱▱▱▱ 63% · 5d 1h',
      tooltip: 'Weekly: 63% used, resets in 5d 1h\nUpdated 2m ago by Claude Code',
      level: 'ok',
    });
  });

  it('says how long ago Claude Code reported, in whole minutes passed', () => {
    const [fiveHour] = windowViewsOf({ ...reading(83, 63), updatedAt: NOW - 2.9 * MINUTE }, NOW);

    assert.match(fiveHour?.tooltip ?? '', /Updated 2m ago by Claude Code$/);
  });

  it("shows a gateway's spend limit by name, after the 5-hour and weekly windows", () => {
    const views = windowViewsOf(
      { ...reading(83, 63), limits: [{ kind: 'spend_limit', percentUsed: 40 }, ...reading(83, 63).limits] },
      NOW,
    );

    assert.deepEqual(
      views.map(view => view.text),
      ['5h ▰▰▰▰▰▰▰▰▱▱ 83% · 18m', '7d ▰▰▰▰▰▰▱▱▱▱ 63% · 5d 1h', 'Spend ▰▰▰▰▱▱▱▱▱▱ 40%'],
    );
    assert.equal(views[2]?.name, 'Spend Limit');
  });

  it('warns from 75% and alarms from 90%, each window for itself', () => {
    assert.deepEqual(levels(74, 20), ['ok', 'ok']);
    assert.deepEqual(levels(74.5, 20), ['warning', 'ok']);
    assert.deepEqual(levels(20, 75), ['ok', 'warning']);
    assert.deepEqual(levels(90, 82), ['error', 'warning']);
  });

  it('shows a window past its reset as reset, and stops warning about it', () => {
    const [fiveHour] = windowViewsOf(reading(95, 20), NOW + 30 * MINUTE);

    assert.equal(fiveHour?.text, '5h reset');
    assert.equal(fiveHour?.level, 'ok');
  });

  it('has no windows before Claude Code has written a reading with limits', () => {
    assert.deepEqual(windowViewsOf(undefined, NOW), []);
    assert.deepEqual(windowViewsOf({ updatedAt: NOW, limits: [] }, NOW), []);
  });
});
