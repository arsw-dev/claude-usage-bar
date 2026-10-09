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

// This repo is the plugin's marketplace
const MARKETPLACE = 'arsw-dev/claude-usage-bar';

// A command that hangs (a stalled network, a cold start gone wrong) would otherwise leave setting up spinning for good.
// Listing is local; the others may fetch from GitHub
const LIST_TIMEOUT_MS = 30_000;
const COMMAND_TIMEOUT_MS = 120_000;

const listSchema = z.array(z.object({ id: z.string(), version: z.string(), enabled: z.boolean().default(true) }));
const resultSchema = z.object({
  outcome: z.string(),
  message: z.string().optional(),
  alreadyInGoalState: z.boolean().optional(),
});

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

// Its version, and whether it's turned on in Claude Code. Undefined when it isn't installed
const installedPlugin = async (claude: string): Promise<{ version: string; enabled: boolean } | undefined> => {
  const { stdout } = await run(claude, ['plugin', 'list', '--json'], { timeout: LIST_TIMEOUT_MS });

  return listSchema.parse(JSON.parse(stdout)).find(plugin => plugin.id === PLUGIN_ID);
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

// The outcome a command run with --json prints on its last line, after any progress. Undefined when there's none
const outcomeOf = (stdout: string) => {
  try {
    return resultSchema.parse(JSON.parse(stdout.trim().split('\n').at(-1) ?? ''));
  } catch {
    return undefined;
  }
};

// A command that fails exits 1, still with its outcome, whose message says why in a line: that's what the error
// carries, never the command line with the user's paths. One already done (turning on a plugin that's on) counts as done
const runCommand = async (claude: string, args: string[]): Promise<void> => {
  const stdout = await run(claude, [...args, '--json'], { timeout: COMMAND_TIMEOUT_MS }).then(
    result => result.stdout,
    (error: unknown) =>
      error instanceof Error && 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '',
  );
  const result = outcomeOf(stdout);

  if (result?.outcome !== 'ok' && result?.alreadyInGoalState !== true) {
    throw new Error(result?.message ?? `claude ${args.join(' ')} didn't finish`);
  }
};

// User scope, so the plugin loads in every Claude Code session, whichever folder it's started in. The marketplace is
// added on its own, since install --marketplace is newer than many Claude Codes, and the plugin turned on, in case it
// was turned off. Running it again changes nothing
const installPlugin = async (claude: string): Promise<void> => {
  await runCommand(claude, ['plugin', 'marketplace', 'add', MARKETPLACE]);
  await runCommand(claude, ['plugin', 'install', PLUGIN_ID]);
  await runCommand(claude, ['plugin', 'enable', PLUGIN_ID]);
};

// The marketplace first, which is this repo cloned when it was added: the plugin updates to what it holds
const updatePlugin = async (claude: string): Promise<void> => {
  await runCommand(claude, ['plugin', 'marketplace', 'update', MARKETPLACE_NAME]);
  await runCommand(claude, ['plugin', 'update', PLUGIN_ID]);
};

// The plugin, then the marketplace that is this repo, even when the plugin was already gone: nothing left behind in
// Claude Code
const uninstallPlugin = async (claude: string): Promise<void> => {
  await runCommand(claude, ['plugin', 'uninstall', PLUGIN_ID]).catch(() => undefined);
  await runCommand(claude, ['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
};

export { claudeCodeIn, findClaude, installedPlugin, installPlugin, isOlder, uninstallPlugin, updatePlugin };
