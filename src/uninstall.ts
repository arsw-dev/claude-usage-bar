// What VS Code runs (vscode:uninstall) once the extension is fully uninstalled, after the editor restarts: plain Node,
// without VS Code's API. It removes the plugin the extension installed, and its reading. Anything that fails is left:
// a plugin left installed writes a file nothing reads, and does no harm

import { rm } from 'node:fs/promises';

import { claudeCodeIn, extensionsFolderOf, findClaude, uninstallPlugin } from './claude.ts';
import { READING_PATH } from './reading.ts';

// Claude Code, if it's still installed, is beside this extension, in whichever editor this ran in
const uninstall = async () => {
  const claude = await findClaude(await claudeCodeIn(extensionsFolderOf(process.argv[1] ?? '')));

  // The reading first: it's quick, and VS Code may stop a script that runs long
  await rm(READING_PATH, { force: true });
  await uninstallPlugin(claude).catch(() => undefined);
};

void uninstall();
