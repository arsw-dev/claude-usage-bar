// A reading as the status bar item shows it: a bar per usage window, its share used and the time until it resets, and a
// colour from whichever window is fuller. Pure: the time comes in as an argument

// One rate-limit window as Claude Code reports it: `five_hour` or `seven_day`, or another kind a gateway adds
type UsageWindow = {
  kind: string;
  percentUsed: number;
  resetsAt?: string | undefined;
};

type Reading = {
  updatedAt: number;
  limits: UsageWindow[];
};

type Level = 'ok' | 'warning' | 'error';

type View = {
  text: string;
  tooltip: string;
  level: Level;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const BAR_CELLS = 10;
const WARNING_PERCENT = 75;
const ERROR_PERCENT = 90;

const LABELS: Readonly<Record<string, { short: string; long: string }>> = {
  five_hour: { short: '5h', long: '5-hour window' },
  seven_day: { short: '7d', long: 'Weekly' },
};

const ORDER = ['five_hour', 'seven_day'];

// The two known windows in that order, anything else (a gateway's spend limit) after them
const rank = (kind: string): number => (ORDER.includes(kind) ? ORDER.indexOf(kind) : ORDER.length);

const bar = (percent: number): string => {
  const filled = Math.min(BAR_CELLS, Math.max(0, Math.round((percent / 100) * BAR_CELLS)));

  // Filled and empty segments drawn as a pair: the shade blocks (░) aren't in the system UI font, and its fallback drew
  // the track as separate squares; thin lines were hard to read at that size
  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled);
};

const countdown = (ms: number): string => {
  if (ms < HOUR) {
    return `${Math.max(1, Math.ceil(ms / MINUTE))}m`;
  }

  if (ms < DAY) {
    return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`;
  }

  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
};

const ago = (ms: number): string => (ms < MINUTE ? 'just now' : `${countdown(ms)} ago`);

// A window whose reset time has passed has a percentage from before the reset: it's shown as reset, and counts as
// empty, until the next reply reports a fresh one
const msLeft = (window: UsageWindow, now: number): number | undefined => {
  if (window.resetsAt === undefined) {
    return undefined;
  }

  const resetsAt = Date.parse(window.resetsAt);

  return Number.isNaN(resetsAt) ? undefined : resetsAt - now;
};

const describeWindow = (window: UsageWindow, now: number) => {
  const label = LABELS[window.kind] ?? { short: window.kind, long: window.kind };
  const left = msLeft(window, now);
  const percent = Math.round(window.percentUsed);

  if (left !== undefined && left <= 0) {
    return { percent: 0, text: `${label.short} reset`, tooltip: `${label.long}: reset, no new reading yet` };
  }

  const resets = left === undefined ? '' : ` · ${countdown(left)}`;
  const resetsLong = left === undefined ? '' : `, resets in ${countdown(left)}`;

  return {
    percent,
    text: `${label.short} ${bar(percent)} ${percent}%${resets}`,
    tooltip: `${label.long}: ${percent}% used${resetsLong}`,
  };
};

const levelOf = (percent: number): Level =>
  percent >= ERROR_PERCENT ? 'error' : percent >= WARNING_PERCENT ? 'warning' : 'ok';

const viewOf = (reading: Reading | undefined, now: number): View => {
  if (reading === undefined || reading.limits.length === 0) {
    return {
      text: 'Claude usage: no reading',
      tooltip: 'Claude Code writes a reading after its next reply (Pro or Max plans only)',
      level: 'ok',
    };
  }

  const windows = reading.limits.toSorted((a, b) => rank(a.kind) - rank(b.kind)).map(w => describeWindow(w, now));
  const worst = Math.max(...windows.map(w => w.percent));

  return {
    text: windows.map(w => w.text).join('   '),
    tooltip: [...windows.map(w => w.tooltip), `Updated ${ago(now - reading.updatedAt)} by Claude Code`].join('\n'),
    level: levelOf(worst),
  };
};

export { bar, countdown, viewOf };
export type { Level, Reading, UsageWindow, View };
