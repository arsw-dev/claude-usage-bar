// Claude Code's CLI, which installs the plugin that writes the reading, so the extension is the only thing a user
// installs. The claude binary is the one the Claude Code extension bundles: VS Code started from the Dock has no shell
// PATH, and many users never install the CLI on its own

import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

const run = promisify(execFile);

const PLUGIN_ID = 'usage-bar@claude-usage-bar';

// This repo is the plugin's marketplace. Claude Code adds it on the first install and finds it already added after that
const MARKETPLACE = 'arsw-dev/claude-usage-bar';

const listSchema = z.array(z.object({ id: z.string() }));
const resultSchema = z.object({ outcome: z.string(), message: z.string().optional() });

// The bundled binary, where the Claude Code extension keeps it, else `claude` on the PATH for those who have the CLI
const findClaude = async (extensionPath: string | undefined): Promise<string> => {
  if (extensionPath !== undefined) {
    const bundled = join(
      extensionPath,
      'resources',
      'native-binary',
      process.platform === 'win32' ? 'claude.exe' : 'claude',
    );

    try {
      await access(bundled, constants.X_OK);

      return bundled;
    } catch {
      // Not where the Claude Code extension used to keep it
    }
  }

  return 'claude';
};

const isPluginInstalled = async (claude: string): Promise<boolean> => {
  const { stdout } = await run(claude, ['plugin', 'list', '--json']);

  return listSchema.parse(JSON.parse(stdout)).some(plugin => plugin.id === PLUGIN_ID);
};

// User scope, so the plugin loads in every Claude Code session, whichever folder it's started in. Installing again
// changes nothing
const installPlugin = async (claude: string): Promise<void> => {
  const { stdout } = await run(claude, ['plugin', 'install', 'usage-bar', '--marketplace', MARKETPLACE, '--json']);
  const result = resultSchema.parse(JSON.parse(stdout));

  if (result.outcome !== 'ok') {
    throw new Error(result.message ?? `the install ended ${result.outcome}`);
  }
};

export { findClaude, installPlugin, isPluginInstalled };
