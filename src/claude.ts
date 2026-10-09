// Claude Code's CLI, which installs the plugin that writes the reading, so the extension is the only thing a user
// installs. The claude binary is the one the Claude Code extension bundles: VS Code started from the Dock has no shell
// PATH, and many users never install the CLI on its own

import { execFile } from 'node:child_process';
import { access, constants, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

const run = promisify(execFile);

const MARKETPLACE_NAME = 'claude-usage-bar';
const PLUGIN_ID = `usage-bar@${MARKETPLACE_NAME}`;

// This repo is the plugin's marketplace. Claude Code adds it on the first install and finds it already added after that
const MARKETPLACE = 'arsw-dev/claude-usage-bar';

const listSchema = z.array(z.object({ id: z.string(), version: z.string() }));
const resultSchema = z.object({ outcome: z.string(), message: z.string().optional() });

// The newest Claude Code extension in an extensions folder, where VS Code keeps each installed extension in a folder of
// its own (anthropic.claude-code-2.1.295-darwin-arm64). Several versions can sit side by side until VS Code cleans up
const claudeCodeIn = async (extensionsFolder: string): Promise<string | undefined> => {
  const found = (await readdir(extensionsFolder).catch(() => []))
    .map(name => ({ name, version: /^anthropic\.claude-code-(\d+\.\d+\.\d+)/i.exec(name)?.[1] }))
    .filter(folder => folder.version !== undefined);

  const newest = found.reduce<(typeof found)[number] | undefined>(
    (best, folder) => (best === undefined || isOlder(best.version ?? '', folder.version ?? '') ? folder : best),
    undefined,
  );

  return newest === undefined ? undefined : join(extensionsFolder, newest.name);
};

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

// Undefined when it isn't installed
const installedVersion = async (claude: string): Promise<string | undefined> => {
  const { stdout } = await run(claude, ['plugin', 'list', '--json']);

  return listSchema.parse(JSON.parse(stdout)).find(plugin => plugin.id === PLUGIN_ID)?.version;
};

// Whether version a (x.y.z) comes before version b
const isOlder = (a: string, b: string): boolean => {
  const [x, y] = [a, b].map(version => version.split('.').map(Number));

  for (const [i, part] of (x ?? []).entries()) {
    const other = y?.[i] ?? 0;

    if (part !== other) {
      return part < other;
    }
  }

  return false;
};

// A command run with --json answers with its outcome on its last line, after any progress it prints
const runCommand = async (claude: string, args: string[]): Promise<void> => {
  const { stdout } = await run(claude, [...args, '--json']);
  const result = resultSchema.parse(JSON.parse(stdout.trim().split('\n').at(-1) ?? ''));

  if (result.outcome !== 'ok') {
    throw new Error(result.message ?? `${args.join(' ')} ended ${result.outcome}`);
  }
};

// User scope, so the plugin loads in every Claude Code session, whichever folder it's started in. Installing again
// changes nothing
const installPlugin = async (claude: string): Promise<void> => {
  await runCommand(claude, ['plugin', 'install', 'usage-bar', '--marketplace', MARKETPLACE]);
};

// The marketplace first, which is this repo cloned when it was added: the plugin updates to what it holds
const updatePlugin = async (claude: string): Promise<void> => {
  await runCommand(claude, ['plugin', 'marketplace', 'update', MARKETPLACE_NAME]);
  await runCommand(claude, ['plugin', 'update', PLUGIN_ID]);
};

// The plugin, then the marketplace that is this repo: nothing left behind in Claude Code
const uninstallPlugin = async (claude: string): Promise<void> => {
  await runCommand(claude, ['plugin', 'uninstall', PLUGIN_ID]);
  await runCommand(claude, ['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
};

export { claudeCodeIn, findClaude, installedVersion, installPlugin, isOlder, uninstallPlugin, updatePlugin };
