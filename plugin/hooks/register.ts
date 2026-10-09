// Claude Code tells a plugin the rate-limit windows, but its VS Code panel draws nothing a plugin adds, so the reading
// goes to a file the Usage Bar extension shows in VS Code's status bar (src/reading.ts reads it)

import type { EngineInterface, Register, SessionRateLimit } from 'claude-code';

const READING = '.claude/usage-bar.json';

// The file's format, which the extension checks
const VERSION = 1;

// The limits are the account's, so the latest reading wins whichever session wrote it. An empty list (no reading
// yet, or not a subscription) never overwrites another session's. Windows has no HOME, only USERPROFILE
const write = async ($: EngineInterface, limits: readonly SessionRateLimit[]): Promise<void> => {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'));

  if (home === undefined || limits.length === 0) {
    return;
  }

  await $.fs.write(`${home}/${READING}`, JSON.stringify({ version: VERSION, updatedAt: await $.clock.now(), limits }));
};

const register: Register = on => {
  // A new chat has no limits until Claude's first reply. A chat that loads the plugin later (/reload-plugins) already
  // has them, and writes them straight away
  on('session.start', async ($, e, next) => {
    const result = await next(e);

    await write($, (await $.session.usage()).rateLimits);

    return result;
  });

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await write($, e.rateLimits);
    }

    return next(e);
  });
};

export { register };
