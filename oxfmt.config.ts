import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 120,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'avoid',
  // Markdown wraps at printWidth too, so prose never has to be wrapped by hand
  proseWrap: 'always',
  // Imports in groups, a blank line between each: Node's built-ins, packages, then relative ones. Type imports come
  // last, in one block of their own
  sortImports: {
    groups: [
      'value-builtin',
      'value-external',
      ['value-parent', 'value-sibling', 'value-index'],
      'type-import',
      'unknown',
    ],
    newlinesBetween: true,
  },
});
