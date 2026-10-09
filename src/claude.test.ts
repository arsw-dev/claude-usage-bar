import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { findClaude, installPlugin, isPluginInstalled } from './claude.ts';

let dir = '';

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'claude-'));
});

after(async () => {
  await rm(dir, { recursive: true });
});

// A stand-in for the claude binary: it notes the arguments it was given and prints the answer it's handed
const fakeClaude = async (answer: unknown) => {
  const folder = await mkdtemp(join(dir, 'fake-'));
  const binary = join(folder, 'claude');

  await writeFile(join(folder, 'answer.json'), JSON.stringify(answer));
  await writeFile(binary, `#!/bin/sh\necho "$@" > "${folder}/args"\ncat "${folder}/answer.json"\n`);
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

describe('isPluginInstalled', () => {
  it('finds the plugin by its ID among those installed', async () => {
    const installed = await fakeClaude([{ id: 'other@somewhere' }, { id: 'usage-bar@claude-usage-bar' }]);
    const elsewhere = await fakeClaude([{ id: 'usage-bar@another-marketplace' }]);

    assert.equal(await isPluginInstalled(installed.binary), true);
    assert.equal(await installed.args(), 'plugin list --json');
    assert.equal(await isPluginInstalled(elsewhere.binary), false);
  });
});

describe('installPlugin', () => {
  it('installs from this repo as a marketplace', async () => {
    const claude = await fakeClaude({ outcome: 'ok' });

    await installPlugin(claude.binary);
    assert.equal(await claude.args(), 'plugin install usage-bar --marketplace arsw-dev/claude-usage-bar --json');
  });

  it("fails with Claude Code's reason when the install doesn't go through", async () => {
    const claude = await fakeClaude({ outcome: 'error', message: 'Marketplace file not found' });

    await assert.rejects(installPlugin(claude.binary), { message: 'Marketplace file not found' });
  });
});
