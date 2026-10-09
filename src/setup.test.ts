import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSetup } from './setup.ts';

import type { SetupDeps } from './setup.ts';

const OFFER = 'Usage Bar needs a small Claude Code plugin to show your usage.';
const SET_UP = '$(gear) Claude Usage: set up';

type Fakes = {
  installed?: () => Promise<{ version: string; enabled: boolean } | undefined>;
  install?: () => Promise<void>;
  update?: () => Promise<void>;
  // The buttons clicked, in order
  clicks?: string[];
};

// Setting up with Claude Code's CLI and VS Code's dialogs faked, noting what it asked, said and ran
const fakeSetup = ({
  installed = async () => undefined,
  install = async () => {},
  update = async () => {},
  clicks = [],
}: Fakes) => {
  const seen = { asked: [] as string[], failed: [] as string[], copied: [] as string[], installs: 0, updates: 0 };
  const stored = new Map<string, unknown>();

  const deps: SetupDeps = {
    version: '1.2.0',
    state: {
      get: key => stored.get(key),
      update: async (key, value) => {
        stored.set(key, value);
      },
    },
    plugin: {
      installed,
      install: async () => {
        seen.installs += 1;
        await install();
      },
      update: async () => {
        seen.updates += 1;
        await update();
      },
    },
    ui: {
      ask: async message => {
        seen.asked.push(message);

        return clicks.shift();
      },
      fail: message => {
        seen.failed.push(message);
      },
      pick: async () => undefined,
      copy: async text => {
        seen.copied.push(text);
      },
    },
    changed: () => {},
  };

  const setup = createSetup(deps);

  return { setup, seen, text: () => setup.view()?.text };
};

describe('createSetup', () => {
  it('offers the plugin at startup, installs it on Install, and copies the reload command', async () => {
    const { setup, seen, text } = fakeSetup({ clicks: ['Install', 'Copy Command'] });

    await setup.check();
    assert.deepEqual(seen.asked, [OFFER, 'Usage Bar is set up. Run /reload-plugins in open Claude chats.']);
    assert.equal(seen.installs, 1);
    assert.deepEqual(seen.copied, ['/reload-plugins']);
    assert.equal(text(), '$(check) Claude Usage: shows after next reply');
  });

  it('asks once: after Not Now, the item is the way back', async () => {
    const { setup, seen, text } = fakeSetup({ clicks: ['Not Now'] });

    await setup.check();
    await setup.check();
    assert.deepEqual(seen.asked, [OFFER]);
    assert.equal(seen.installs, 0);
    assert.equal(text(), SET_UP);
    assert.equal(setup.view()?.replacesReading, true, 'a reading left behind is stale');
  });

  it("goes back to set up, with Claude Code's reason, when installing fails", async () => {
    const { setup, seen, text } = fakeSetup({
      install: async () => {
        throw new Error('Marketplace file not found');
      },
    });

    await setup.install();
    assert.deepEqual(seen.failed, ["Usage Bar couldn't install its Claude Code plugin: Marketplace file not found"]);
    assert.equal(text(), SET_UP);
  });

  it('installs once, however often it is asked while installing', async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const { setup, seen, text } = fakeSetup({ install: () => promise });

    const first = setup.install();
    const second = setup.install();

    assert.equal(text(), '$(sync~spin) Claude Usage: installing');
    resolve();
    await Promise.all([first, second]);
    assert.equal(seen.installs, 1);
  });

  it('shows a plugin turned off in Claude Code without asking, and installing turns it on', async () => {
    const { setup, seen, text } = fakeSetup({ installed: async () => ({ version: '1.2.0', enabled: false }) });

    await setup.check();
    assert.equal(text(), '$(gear) Claude Usage: plugin turned off');
    assert.equal(setup.view()?.replacesReading, true, 'its last reading is stale');
    assert.deepEqual(seen.asked, []);

    await setup.install();
    assert.equal(seen.installs, 1);
  });

  it("says it can't find the CLI when claude won't start, and offers the plugin when it fails otherwise", async () => {
    const missing = fakeSetup({
      installed: () => Promise.reject(Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })),
    });
    const failing = fakeSetup({ installed: () => Promise.reject(new Error('Unexpected token')) });

    await missing.setup.check();
    await failing.setup.check();
    assert.equal(missing.text(), "Claude Usage: can't find Claude Code's CLI");
    assert.deepEqual(missing.seen.asked, []);
    assert.equal(failing.text(), SET_UP);
    assert.equal(failing.setup.view()?.replacesReading, undefined, 'the plugin may be in, and its reading right');
    assert.deepEqual(failing.seen.asked, [OFFER]);
  });

  it('leaves an install started while listing to say how it went', async () => {
    const listing = Promise.withResolvers<undefined>();
    const installing = Promise.withResolvers<void>();
    const { setup, seen, text } = fakeSetup({ installed: () => listing.promise, install: () => installing.promise });

    const checked = setup.check();
    const installed = setup.install();

    listing.resolve(undefined);
    await checked;
    assert.equal(text(), '$(sync~spin) Claude Usage: installing');
    assert.deepEqual(seen.asked, []);

    installing.resolve();
    await installed;
  });

  it("updates a plugin older than the extension quietly, even when that fails, and leaves one that's current", async () => {
    const older = fakeSetup({
      installed: async () => ({ version: '1.1.0', enabled: true }),
      update: async () => {
        throw new Error('offline');
      },
    });
    const current = fakeSetup({ installed: async () => ({ version: '1.2.0', enabled: true }) });

    await older.setup.check();
    await current.setup.check();
    assert.equal(older.seen.updates, 1);
    assert.equal(older.text(), undefined);
    assert.equal(current.seen.updates, 0);
    assert.equal(current.text(), undefined);
  });
});
