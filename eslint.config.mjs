// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  ...tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended),
  {
    ignores: [
      '**/src/web/nextui/_next/**/*',
      '**/src/web/nextui/.next/**/*',
      '**/src/web/nextui/out/**/*',
      'dist/**/*',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/ban-types': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/no-var-requires': 0,
      'no-case-declarations': 0,
      'no-control-regex': 0,
      'no-empty': 0,
      'no-useless-escape': 0,
    },
  },
  {
    files: ['examples/**'],
    rules: {
      '@typescript-eslint/no-namespace': 0,
      '@typescript-eslint/no-var-requires': 0,
    },
  },
];
