import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { findClaude, installedVersion, installPlugin, isOlder, updatePlugin } from './claude.ts';

let dir = '';

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'claude-'));
});

after(async () => {
  await rm(dir, { recursive: true });
});

// A stand-in for the claude binary: it notes the arguments of each call, a line each, and prints the answer it's handed
const fakeClaude = async (answer: unknown) => {
  const folder = await mkdtemp(join(dir, 'fake-'));
  const binary = join(folder, 'claude');

  await writeFile(join(folder, 'answer.json'), JSON.stringify(answer));
  await writeFile(binary, `#!/bin/sh\necho "$@" >> "${folder}/args"\ncat "${folder}/answer.json"\n`);
  await chmod(binary, 0o755);

  return { binary, args: async () => (await readFile(join(folder, 'args'), 'utf8')).trim() };
};

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

describe('installedVersion', () => {
  it('finds the plugin by its ID among those installed, and says which version it is', async () => {
    const installed = await fakeClaude([
      { id: 'other@somewhere', version: '2.0.0' },
      { id: 'usage-bar@claude-usage-bar', version: '1.2.0' },
    ]);
    const elsewhere = await fakeClaude([{ id: 'usage-bar@another-marketplace', version: '1.2.0' }]);

    assert.equal(await installedVersion(installed.binary), '1.2.0');
    assert.equal(await installed.args(), 'plugin list --json');
    assert.equal(await installedVersion(elsewhere.binary), undefined);
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
  it('installs from this repo as a marketplace', async () => {
    const claude = await fakeClaude({ outcome: 'ok' });

    await installPlugin(claude.binary);
    assert.equal(await claude.args(), 'plugin install usage-bar --marketplace arsw-dev/claude-usage-bar --json');
  });

  it("fails with Claude Code's reason when it doesn't go through", async () => {
    const claude = await fakeClaude({ outcome: 'error', message: 'Marketplace file not found' });

    await assert.rejects(installPlugin(claude.binary), { message: 'Marketplace file not found' });
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
