// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from "globals";

export default [
  ...tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
  ),
  {
    ignores: [
      "**/src/web/nextui/_next/**/*",
      "**/src/web/nextui/.next/**/*",
      "**/src/web/nextui/out/**/*",
      "dist/**/*",
    ],
  },
  {
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
    },
  },
];