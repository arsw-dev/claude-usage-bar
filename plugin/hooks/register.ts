// Claude Code tells a plugin the rate-limit windows, but its VS Code panel draws nothing a plugin adds, so the reading
// goes to a file the Usage Bar extension shows in VS Code's status bar (src/reading.ts reads it)

import type { EngineInterface, Register, SessionRateLimit } from 'claude-code';

const READING = '.claude/usage-bar.json';

// The file's format, which the extension checks
const VERSION = 1;

// Where the extension looks, which is Node's home folder: USERPROFILE on Windows, where it ignores a HOME some tools
// set, and HOME everywhere else. Anything but an absolute path writes nothing, rather than somewhere unexpected
const readingPath = async ($: EngineInterface): Promise<string | undefined> => {
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'));

  return home !== undefined && /^(\/|[A-Za-z]:[\\/])/.test(home) ? `${home}/${READING}` : undefined;
};

// The limits are the account's, so the latest reading wins whichever session wrote it. An empty list (no reading
// yet, or not a subscription) never overwrites another session's
const write = async ($: EngineInterface, path: string, limits: readonly SessionRateLimit[]): Promise<void> => {
  if (limits.length > 0) {
    await $.fs.write(path, JSON.stringify({ version: VERSION, updatedAt: await $.clock.now(), limits }));
  }
};

const register: Register = on => {
  // A new chat has no limits until Claude's first reply. One that loads the plugin later (/reload-plugins) has the
  // limits of its own last reply, which may be hours old: they're written only when there's no reading yet, the first
  // one after installing, and never over a newer one from another chat
  on('session.start', async ($, e, next) => {
    const result = await next(e);
    const path = await readingPath($);

    if (path !== undefined && !(await $.fs.exists(path))) {
      await write($, path, (await $.session.usage()).rateLimits);
    }

    return result;
  });

  on('session.measure', async ($, e, next) => {
    const path = e.changed.includes('rateLimits') ? await readingPath($) : undefined;

    if (path !== undefined) {
      await write($, path, e.rateLimits);
    }

    return next(e);
  });
};

export { register };
