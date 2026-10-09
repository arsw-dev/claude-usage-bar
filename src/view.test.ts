import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bar, countdown, viewOf } from './view.ts';

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
});

describe('viewOf', () => {
  it('shows the 5-hour window first, then the week', () => {
    const view = viewOf(reading(83, 63), NOW);

    assert.equal(view.text, '5h ▰▰▰▰▰▰▰▰▱▱ 83% · 18m   7d ▰▰▰▰▰▰▱▱▱▱ 63% · 5d 1h');
    assert.equal(
      view.tooltip,
      '5-hour window: 83% used, resets in 18m\nWeekly: 63% used, resets in 5d 1h\nUpdated 2m ago by Claude Code',
    );
  });

  it('warns from 75% and alarms from 90%, on whichever window is fuller', () => {
    assert.equal(viewOf(reading(74, 20), NOW).level, 'ok');
    assert.equal(viewOf(reading(20, 75), NOW).level, 'warning');
    assert.equal(viewOf(reading(90, 20), NOW).level, 'error');
  });

  it('shows a window past its reset as reset, and stops warning about it', () => {
    const view = viewOf(reading(95, 20), NOW + 30 * MINUTE);

    assert.match(view.text, /^5h reset {3}7d/);
    assert.equal(view.level, 'ok');
  });

  it('says there is no reading before Claude Code has written one', () => {
    assert.equal(viewOf(undefined, NOW).text, 'Claude Usage: no reading');
    assert.equal(viewOf({ updatedAt: NOW, limits: [] }, NOW).text, 'Claude Usage: no reading');
  });
});
