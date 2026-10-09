// The extension's entry point, which VS Code loads once startup has finished: one status bar item, redrawn from the
// reading on a timer, so the countdowns move between replies and a new reading shows within seconds. Until there's a
// reading, it shows where setting up stands (setup.ts)

import { commands, extensions, StatusBarAlignment, ThemeColor, window } from 'vscode';

import { findClaude } from './claude.ts';
import { readReading } from './reading.ts';
import { createSetup, explain, EXPLAIN, SET_UP } from './setup.ts';
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

    const setupView = setup.view();

    if (last === undefined && setupView !== undefined) {
      item.text = setupView.text;
      item.tooltip = setupView.tooltip;
      item.backgroundColor = undefined;
      item.command = setupView.command;

      return;
    }

    const view = viewOf(last, Date.now());
    const background = BACKGROUNDS[view.level];

    item.text = view.text;
    item.tooltip = view.tooltip;
    item.backgroundColor = background === undefined ? undefined : new ThemeColor(background);
    item.command = undefined;
  };

  const claude = findClaude(extensions.getExtension('anthropic.claude-code')?.extensionPath);
  const setup = createSetup(context, claude, () => void refresh());

  void refresh();
  item.show();
  void setup.check();

  const timer = setInterval(() => void refresh(), REFRESH_MS);
  context.subscriptions.push(
    item,
    commands.registerCommand(SET_UP, setup.install),
    commands.registerCommand(EXPLAIN, explain),
    { dispose: () => clearInterval(timer) },
  );
};

const deactivate = (): void => {};

export { activate, deactivate };
