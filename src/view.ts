// A reading as the status bar shows it: an item per usage window, with a bar, its share used, the time until it resets,
// and a colour of its own. Pure: the time comes in as an argument

// One rate-limit window as Claude Code reports it: `five_hour`, `seven_day`, or a Claude gateway's `spend_limit`
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

// A window's item, by its kind, with the name VS Code lists it under in the status bar's menu
type WindowView = View & { kind: string; name: string };

const MINUTE = 60_000;

const BAR_CELLS = 10;
const WARNING_PERCENT = 75;
const ERROR_PERCENT = 90;

const LABELS: Readonly<Record<string, { short: string; long: string; name: string }>> = {
  five_hour: { short: '5h', long: '5-hour window', name: '5-Hour Window' },
  seven_day: { short: '7d', long: 'Weekly', name: 'Weekly' },
  spend_limit: { short: 'Spend', long: 'Spend limit', name: 'Spend Limit' },
};

const WAITING: View = {
  text: "Claude Usage: waiting for Claude's reply",
  tooltip:
    "Your usage shows after Claude's next reply, on a Pro or Max plan. In a chat that was already open, run /reload-plugins first",
  level: 'ok',
};

const ORDER = ['five_hour', 'seven_day', 'spend_limit'];

// The known windows in that order, any kind a newer Claude Code adds after them, by its own name
const rank = (kind: string): number => (ORDER.includes(kind) ? ORDER.indexOf(kind) : ORDER.length);

const bar = (percent: number): string => {
  const filled = Math.min(BAR_CELLS, Math.max(0, Math.round((percent / 100) * BAR_CELLS)));

  // Filled and empty segments drawn as a pair: the shade blocks (░) aren't in the system UI font, and its fallback drew
  // the track as separate squares; thin lines were hard to read at that size
  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled);
};

// In minutes, then hours and minutes, then days and hours, from whole minutes rounded one way: up for the time left
// (never 0m while there's some), down for the time since
const duration = (ms: number, round: (minutes: number) => number): string => {
  const minutes = Math.max(1, round(ms / MINUTE));
  const hours = Math.floor(minutes / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const countdown = (ms: number): string => duration(ms, Math.ceil);

const ago = (ms: number): string => (ms < MINUTE ? 'just now' : `${duration(ms, Math.floor)} ago`);

// A window whose reset time has passed has a percentage from before the reset: it's shown as reset, and counts as
// empty, until the next reply reports a fresh one
const msLeft = (window: UsageWindow, now: number): number | undefined => {
  if (window.resetsAt === undefined) {
    return undefined;
  }

  const resetsAt = Date.parse(window.resetsAt);

  return Number.isNaN(resetsAt) ? undefined : resetsAt - now;
};

const levelOf = (percent: number): Level =>
  percent >= ERROR_PERCENT ? 'error' : percent >= WARNING_PERCENT ? 'warning' : 'ok';

const viewOfWindow = (window: UsageWindow, updated: string, now: number): WindowView => {
  const label = LABELS[window.kind] ?? { short: window.kind, long: window.kind, name: window.kind };
  const left = msLeft(window, now);
  const percent = Math.round(window.percentUsed);
  const named = { kind: window.kind, name: label.name };

  if (left !== undefined && left <= 0) {
    return {
      ...named,
      text: `${label.short} reset`,
      tooltip: `${label.long}: reset, no new reading yet\n${updated}`,
      level: 'ok',
    };
  }

  const resets = left === undefined ? '' : ` · ${countdown(left)}`;
  const resetsLong = left === undefined ? '' : `, resets in ${countdown(left)}`;

  return {
    ...named,
    text: `${label.short} ${bar(percent)} ${percent}%${resets}`,
    tooltip: `${label.long}: ${percent}% used${resetsLong}\n${updated}`,
    level: levelOf(percent),
  };
};

// None until Claude Code has written a reading with limits
const windowViewsOf = (reading: Reading | undefined, now: number): WindowView[] => {
  if (reading === undefined) {
    return [];
  }

  const updated = `Updated ${ago(now - reading.updatedAt)} by Claude Code`;

  return reading.limits.toSorted((a, b) => rank(a.kind) - rank(b.kind)).map(w => viewOfWindow(w, updated, now));
};

export { bar, countdown, WAITING, windowViewsOf };
export type { Level, Reading, UsageWindow, View, WindowView };
