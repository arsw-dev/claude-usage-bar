// The extension's entry point, which VS Code loads once startup has finished: one status bar item, redrawn from the
// reading on a timer, so the countdowns move between replies and a new reading shows within seconds

import { StatusBarAlignment, ThemeColor, window } from 'vscode';

import { readReading } from './reading.ts';
import { viewOf } from './view.ts';

import type { Level, Reading } from './view.ts';
import type { ExtensionContext } from 'vscode';

const REFRESH_MS = 10_000;

// The only two backgrounds VS Code lets a status bar item take
const BACKGROUNDS: Readonly<Record<Level, string | undefined>> = {
  ok: undefined,
  warning: 'statusBarItem.warningBackground',
  error: 'statusBarItem.errorBackground',
};

const activate = (context: ExtensionContext): void => {
  // Left, after everything else there (the lowest priority), away from the extensions' items on the right
  const item = window.createStatusBarItem('claude-usage-bar', StatusBarAlignment.Left, -1000);
  item.name = 'Claude Usage';

  let last: Reading | undefined;

  const refresh = async () => {
    last = (await readReading()) ?? last;

    const view = viewOf(last, Date.now());
    const background = BACKGROUNDS[view.level];

    item.text = view.text;
    item.tooltip = view.tooltip;
    item.backgroundColor = background === undefined ? undefined : new ThemeColor(background);
  };

  void refresh();
  item.show();

  const timer = setInterval(() => void refresh(), REFRESH_MS);
  context.subscriptions.push(item, { dispose: () => clearInterval(timer) });
};

const deactivate = (): void => {};

export { activate, deactivate };
