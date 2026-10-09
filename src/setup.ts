// Setting up: until there's a reading, the status bar item says where things stand, and the extension installs the
// plugin that writes the reading after one click. Claude Code learns the limits from its replies, so even once the
// plugin is in, the first reading comes with Claude's next reply; a chat that was already open needs /reload-plugins
// first, since Claude Code loads plugins when a session starts

import { env, window } from 'vscode';

import { installPlugin, isPluginInstalled } from './claude.ts';

import type { ExtensionContext } from 'vscode';

// Ready means the plugin is in and the item shows the reading as it is
type Setup = 'ready' | 'needs-claude-code' | 'needs-plugin' | 'installing' | 'installed';

type SetupView = { text: string; tooltip: string; command?: string };

const SET_UP = 'claude-usage-bar.setUp';
const EXPLAIN = 'claude-usage-bar.explain';
const DECLINED_KEY = 'setUpDeclined';

const RELOAD = '/reload-plugins';

const SETUP_VIEWS: Readonly<Record<Exclude<Setup, 'ready'>, SetupView>> = {
  'needs-claude-code': {
    text: 'Claude Usage: needs Claude Code',
    tooltip: 'Install the Claude Code extension, then reload the window',
  },
  'needs-plugin': {
    text: '$(gear) Claude Usage: set up',
    tooltip: 'Install the Claude Code plugin that reports your usage',
    command: SET_UP,
  },
  installing: { text: '$(sync~spin) Claude Usage: installing', tooltip: 'Installing the Claude Code plugin' },
  installed: {
    text: '$(check) Claude Usage: shows after next reply',
    tooltip: `Your usage appears after Claude's next reply. In a chat that was already open, run ${RELOAD} first`,
    command: EXPLAIN,
  },
};

const copyReload = async (choice: string | undefined, button: string) => {
  if (choice === button) {
    await env.clipboard.writeText(RELOAD);
  }
};

// Clicked by someone wondering why there are no bars yet. A quick pick rather than a modal, which macOS draws as a
// system dialog: the first row copies the command, the second only explains
const explain = async () => {
  const copy = { label: `$(clippy) Copy ${RELOAD}`, detail: 'For a chat that was already open when you installed' };
  const newChat = {
    label: '$(comment-discussion) New chat? Nothing to do',
    detail: 'Your usage shows once Claude replies',
  };

  const choice = await window.showQuickPick([copy, newChat], {
    title: "Your Claude usage shows after Claude's next reply",
  });

  await copyReload(choice?.label, copy.label);
};

// The setup state, for the item to draw while there's no reading. `changed` redraws it
const createSetup = (context: ExtensionContext, claude: Promise<string>, changed: () => void) => {
  let setup: Setup = 'ready';

  const set = (next: Setup) => {
    setup = next;
    changed();
  };

  const install = async () => {
    set('installing');

    try {
      await installPlugin(await claude);
      set('installed');

      // One line: a longer notification opens collapsed
      const button = 'Copy Command';
      const choice = await window.showInformationMessage(
        `Usage Bar is set up. Run ${RELOAD} in open Claude chats.`,
        button,
      );

      await copyReload(choice, button);
    } catch (error) {
      set('needs-plugin');
      void window.showErrorMessage(`Usage Bar couldn't install its Claude Code plugin: ${String(error)}`);
    }
  };

  // Asked once: after "Not Now", the item's own "set up" is the way back
  const offer = async () => {
    if (context.globalState.get(DECLINED_KEY) === true) {
      return;
    }

    const choice = await window.showInformationMessage(
      'Usage Bar needs a small Claude Code plugin to show your usage.',
      'Install',
      'Not Now',
    );

    if (choice === 'Install') {
      await install();
    } else {
      await context.globalState.update(DECLINED_KEY, true);
    }
  };

  // At startup. A claude that won't start means no Claude Code; one that fails otherwise is treated as no plugin, and
  // installing says why
  const check = async () => {
    try {
      if (await isPluginInstalled(await claude)) {
        return;
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        set('needs-claude-code');

        return;
      }
    }

    set('needs-plugin');
    await offer();
  };

  return { view: () => (setup === 'ready' ? undefined : SETUP_VIEWS[setup]), check, install };
};

export { createSetup, explain, EXPLAIN, SET_UP };
