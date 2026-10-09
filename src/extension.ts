// The extension's entry point, which VS Code loads once startup has finished: a status bar item per usage window,
// redrawn from the reading on a timer, so the countdowns move between replies and a new reading shows within seconds.
// Until there's a reading, one item shows where setting up stands (setup.ts)

import { commands, extensions, StatusBarAlignment, ThemeColor, window } from 'vscode';

import { findClaude } from './claude.ts';
import { readReading } from './reading.ts';
import { createSetup, explain, EXPLAIN, SET_UP } from './setup.ts';
import { WAITING, windowViewsOf } from './view.ts';

import type { Level, Reading, View } from './view.ts';
import type { ExtensionContext, StatusBarItem } from 'vscode';

const REFRESH_MS = 10_000;

// Left, after everything else there (the lowest priorities), away from the extensions' items on the right
const PRIORITY = -1000;

// The only two backgrounds VS Code lets a status bar item take
const BACKGROUNDS: Readonly<Record<Level, string | undefined>> = {
  ok: undefined,
  warning: 'statusBarItem.warningBackground',
  error: 'statusBarItem.errorBackground',
};

// What one item shows. Its ID is what VS Code remembers it by, if it's hidden from the status bar's menu
type Shown = { id: string; name: string; view: View; command?: string | undefined };

const activate = (context: ExtensionContext): void => {
  // An item per window rather than one for all, since an item has one background: only the window that's filling up
  // turns yellow or red. Created as windows first appear, and kept
  const items = new Map<string, StatusBarItem>();

  const itemFor = (id: string, name: string): StatusBarItem => {
    const existing = items.get(id);

    if (existing !== undefined) {
      return existing;
    }

    const item = window.createStatusBarItem(id, StatusBarAlignment.Left, PRIORITY - items.size);
    item.name = name;
    items.set(id, item);

    return item;
  };

  const show = (shown: Shown[]) => {
    for (const { id, name, view, command } of shown) {
      const item = itemFor(id, name);
      const background = BACKGROUNDS[view.level];

      item.text = view.text;
      item.tooltip = view.tooltip;
      item.backgroundColor = background === undefined ? undefined : new ThemeColor(background);
      item.command = command;
      item.show();
    }

    const ids = new Set(shown.map(s => s.id));

    for (const [id, item] of items) {
      if (!ids.has(id)) {
        item.hide();
      }
    }
  };

  let last: Reading | undefined;
  let reading = false;

  const draw = () => {
    const windows = windowViewsOf(last, Date.now());

    if (windows.length > 0) {
      show(windows.map(view => ({ id: `claude-usage-bar.${view.kind}`, name: `Claude Usage: ${view.name}`, view })));

      return;
    }

    const setupView = setup.view();

    const view = setupView === undefined ? WAITING : { ...setupView, level: 'ok' as const };

    show([{ id: 'claude-usage-bar', name: 'Claude Usage', view, command: setupView?.command }]);
  };

  // One read at a time: a file that never finishes reading holds one of the extension host's few I/O threads, not one
  // every tick
  const refresh = async () => {
    if (reading) {
      return;
    }

    reading = true;

    try {
      last = (await readReading()) ?? last;
    } finally {
      reading = false;
    }

    draw();
  };

  const claude = findClaude(extensions.getExtension('anthropic.claude-code')?.extensionPath);
  const setup = createSetup(context, claude, draw);

  void refresh();
  void setup.check();

  const timer = setInterval(() => void refresh(), REFRESH_MS);
  context.subscriptions.push(
    { dispose: () => items.forEach(item => item.dispose()) },
    commands.registerCommand(SET_UP, setup.install),
    commands.registerCommand(EXPLAIN, explain),
    { dispose: () => clearInterval(timer) },
  );
};

const deactivate = (): void => {};

export { activate, deactivate };
