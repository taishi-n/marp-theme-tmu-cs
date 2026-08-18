import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['examples/dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
    },
  },
];
