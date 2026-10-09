import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'import', 'node', 'promise', 'oxc'],
  // oxlint's curated sets: code that's wrong, code that's probably wrong, and code that's slow
  categories: {
    correctness: 'error',
    suspicious: 'error',
    perf: 'error',
  },
  // Rules that need types run on TypeScript's own checker (oxlint-tsgolint). A disable comment that no longer
  // suppresses anything fails
  options: { typeAware: true, reportUnusedDisableDirectives: 'error', respectEslintDisableDirectives: false },
  // Claude Code checks the plugin's module itself (`claude plugin validate`)
  ignorePatterns: ['plugin/**'],
  rules: {
    // Exports are listed once, at the end of the file, and never default
    'import/exports-last': 'error',
    'import/group-exports': 'error',
    'import/no-default-export': 'error',
    // Imports name the file, `.ts` included
    'import/extensions': ['error', 'always', { ignorePackages: true }],
    'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    // `type`, never `interface`, and type-only imports marked as such
    'typescript/consistent-type-definitions': ['error', 'type'],
    'typescript/consistent-type-imports': 'error',
    'typescript/no-explicit-any': 'error',
    // A promise is awaited, returned or explicitly ignored with `void`. node:test tracks its own describe and it
    'typescript/no-floating-promises': [
      'error',
      {
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['describe', 'it', 'suite', 'test'] }],
      },
    ],
    'typescript/no-misused-promises': 'error',
    // Turning a rule off names the rules. TypeScript's own escapes too: no `@ts-ignore`, and `@ts-expect-error` with a
    // description
    'unicorn/no-abusive-eslint-disable': 'error',
    'typescript/ban-ts-comment': 'error',
  },
  overrides: [
    {
      // The tools that load config files read their default export
      files: ['*.config.ts'],
      rules: { 'import/no-default-export': 'off' },
    },
  ],
});
