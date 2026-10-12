# Releasing

Usage Bar ships as one version: the extension, on the VS Code Marketplace and Open VSX, and the Claude Code plugin the
extension installs. A release is a pull request from `main` merged into `release`.

## Branches

- **`main`** is where all development happens, by pull request, with **CI Result** required.
- **`release`** is what's released. Claude Code installs the plugin from it (`.claude-plugin/marketplace.json`), and a
  merge into it publishes the extension. It moves only by a pull request from `main` (the **From Main** check), merged
  with a merge commit, so it keeps `main`'s history.

## Releasing a version

1. **Bump the version on `main`,** in the last pull request before the release (`[version] 1.1.0`):
   - `version` in `package.json` and in `plugin/.claude-plugin/plugin.json` (a test keeps the two equal);
   - in `CHANGELOG.md`, the `Unreleased` heading becomes `## 1.1.0`.
2. **Merge `main` into `release`** by pull request:

   ```sh
   gh pr create --base release --head main --title "[release] 1.1.0" --body "Releases 1.1.0."
   ```

   Merging it starts the release workflow.

3. **Approve the run:** it waits in the `marketplace-publish` environment until a reviewer approves it (Actions → the
   run → **Review deployments**).
4. **The workflow publishes:**
   - it packages the extension;
   - it publishes the package to the VS Code Marketplace, signed in with Microsoft Entra ID through a federated
     credential, and to Open VSX as a trusted publisher, so no token is stored anywhere;
   - it tags `v1.1.0` and creates the GitHub Release, with that version's changelog section as its notes.

## Good to know

- **Forgot the version bump?** The run stops before publishing when the version's tag already exists, and the
  marketplaces refuse a version they already have.
- **The plugin goes live first.** New installs take the plugin from `release` as soon as it's merged, while the new
  extension takes a few minutes to publish. Installed plugins update when their extension does: the extension updates
  its plugin whenever its own version is newer.
- **The reading's format.** A plugin that writes a new format version (`version` in `~/.claude/usage-bar.json`) reaches
  new installs before the extension that reads it. Until it updates, the older extension shows "waiting for Claude's
  reply". So teach the extension to read a new format one release before the plugin starts writing it.
- **A run that fails** can be re-run once the cause is fixed. A marketplace that already has the version is skipped, so
  a run that published to one and failed on the other finishes the job.
