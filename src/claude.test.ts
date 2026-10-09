import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  claudeCodeIn,
  findClaude,
  installedPlugin,
  installPlugin,
  isOlder,
  uninstallPlugin,
  updatePlugin,
} from './claude.ts';

let dir = '';

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'claude-'));
});

after(async () => {
  await rm(dir, { recursive: true });
});

// A stand-in for the claude binary: it notes the arguments of each call, a line each, prints the answer it's handed,
// after any progress lines, and exits 1 for a failure, as claude does
const fakeClaude = async (answer: unknown, { progress = '', exitCode = 0 } = {}) => {
  const folder = await mkdtemp(join(dir, 'fake-'));
  const binary = join(folder, 'claude');

  await writeFile(join(folder, 'answer.json'), answer === undefined ? progress : progress + JSON.stringify(answer));
  await writeFile(binary, `#!/bin/sh\necho "$@" >> "${folder}/args"\ncat "${folder}/answer.json"\nexit ${exitCode}\n`);
  await chmod(binary, 0o755);

  return { binary, args: async () => (await readFile(join(folder, 'args'), 'utf8')).trim() };
};

describe('claudeCodeIn', () => {
  it('finds the newest Claude Code among the installed extensions', async () => {
    const extensions = await mkdtemp(join(dir, 'extensions-'));

    await Promise.all(
      [
        'anthropic.claude-code-2.1.293-darwin-arm64',
        'anthropic.claude-code-2.1.295-darwin-arm64',
        'anthropic.claude-code-2.1.30-darwin-arm64',
        'arsw.claude-usage-bar-1.0.0',
      ].map(name => mkdir(join(extensions, name))),
    );

    assert.equal(await claudeCodeIn(extensions), join(extensions, 'anthropic.claude-code-2.1.295-darwin-arm64'));
  });

  it('finds none without Claude Code, or without the folder', async () => {
    const extensions = await mkdtemp(join(dir, 'extensions-'));

    await mkdir(join(extensions, 'arsw.claude-usage-bar-1.0.0'));

    assert.equal(await claudeCodeIn(extensions), undefined);
    assert.equal(await claudeCodeIn(join(dir, 'missing')), undefined);
  });
});

describe('findClaude', () => {
  it('runs the binary the Claude Code extension bundles', async () => {
    const extension = join(dir, 'anthropic.claude-code-2.1.295');
    const bundled = join(extension, 'resources', 'native-binary', 'claude');

    await mkdir(join(extension, 'resources', 'native-binary'), { recursive: true });
    await writeFile(bundled, '');
    await chmod(bundled, 0o755);

    assert.equal(await findClaude(extension), bundled);
  });

  it('falls back to claude on the PATH, without the extension or its binary', async () => {
    assert.equal(await findClaude(undefined), 'claude');
    assert.equal(await findClaude(join(dir, 'moved')), 'claude');
  });
});

describe('installedPlugin', () => {
  it('finds the plugin by its ID among those installed, with its version and whether it is on', async () => {
    const installed = await fakeClaude([
      { id: 'other@somewhere', version: '2.0.0', enabled: true },
      { id: 'usage-bar@claude-usage-bar', version: '1.2.0', enabled: false },
    ]);
    const elsewhere = await fakeClaude([{ id: 'usage-bar@another-marketplace', version: '1.2.0', enabled: true }]);

    assert.deepEqual(await installedPlugin(installed.binary), {
      id: 'usage-bar@claude-usage-bar',
      version: '1.2.0',
      enabled: false,
    });
    assert.equal(await installed.args(), 'plugin list --json');
    assert.equal(await installedPlugin(elsewhere.binary), undefined);
  });
});

describe('isOlder', () => {
  it('compares versions part by part, as numbers', () => {
    assert.equal(isOlder('0.9.0', '0.10.0'), true);
    assert.equal(isOlder('1.2.3', '1.3.0'), true);
    assert.equal(isOlder('1.3.0', '1.2.9'), false);
    assert.equal(isOlder('1.2.0', '1.2.0'), false);
  });
});

describe('installPlugin', () => {
  it('adds this repo as a marketplace, installs the plugin from it and turns it on', async () => {
    const claude = await fakeClaude({ outcome: 'ok' });

    await installPlugin(claude.binary);
    assert.equal(
      await claude.args(),
      [
        'plugin marketplace add arsw-dev/claude-usage-bar --json',
        'plugin install usage-bar@claude-usage-bar --json',
        'plugin enable usage-bar@claude-usage-bar --json',
      ].join('\n'),
    );
  });

  it('counts a step already done as done', async () => {
    const claude = await fakeClaude(
      { outcome: 'failed', message: 'Plugin is already enabled', alreadyInGoalState: true },
      { exitCode: 1 },
    );

    await installPlugin(claude.binary);
  });

  it("fails with Claude Code's reason when it doesn't go through", async () => {
    const claude = await fakeClaude({ outcome: 'failed', message: 'Marketplace file not found' }, { exitCode: 1 });

    await assert.rejects(installPlugin(claude.binary), { message: 'Marketplace file not found' });
  });

  it("names the command, and none of the user's paths, when there's no reason", async () => {
    const claude = await fakeClaude(undefined, { progress: 'Cloning…\n', exitCode: 1 });

    await assert.rejects(installPlugin(claude.binary), {
      message: "claude plugin marketplace add arsw-dev/claude-usage-bar didn't finish",
    });
  });
});

describe('updatePlugin', () => {
  it('updates the marketplace, then the plugin from it', async () => {
    const claude = await fakeClaude({ outcome: 'ok' });

    await updatePlugin(claude.binary);
    assert.equal(
      await claude.args(),
      'plugin marketplace update claude-usage-bar --json\nplugin update usage-bar@claude-usage-bar --json',
    );
  });
});

describe('versions', () => {
  it("ship the plugin with the extension's version, which the extension updates it to", async () => {
    const extension = JSON.parse(await readFile('package.json', 'utf8'));
    const plugin = JSON.parse(await readFile(join('plugin', '.claude-plugin', 'plugin.json'), 'utf8'));

    assert.equal(plugin.version, extension.version);
  });
});

describe('uninstallPlugin', () => {
  it('uninstalls the plugin, then removes the marketplace, each answering after its progress', async () => {
    const claude = await fakeClaude({ outcome: 'ok' }, { progress: 'Removing…\n' });

    await uninstallPlugin(claude.binary);
    assert.equal(
      await claude.args(),
      'plugin uninstall usage-bar@claude-usage-bar --json\nplugin marketplace remove claude-usage-bar --json',
    );
  });

  it('removes the marketplace even when the plugin was already gone', async () => {
    const claude = await fakeClaude({ outcome: 'failed', failureCode: 'not_installed' }, { exitCode: 1 });

    await assert.rejects(uninstallPlugin(claude.binary));
    assert.match(await claude.args(), /plugin marketplace remove claude-usage-bar/);
  });
});
