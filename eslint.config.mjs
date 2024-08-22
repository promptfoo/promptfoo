// @ts-check
import reactHooks from 'eslint-plugin-react-hooks';
import eslint from '@eslint/js';
import jest from 'eslint-plugin-jest';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  ...tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended),
  {
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      ...jest.configs['flat/style'].rules,
      'jest/consistent-test-it': 'error',
      'jest/expect-expect': 'error',
      'jest/no-test-return-statement': 'error',
      'jest/prefer-called-with': 'error',
      'jest/prefer-expect-resolves': 'error',
      'jest/prefer-hooks-in-order': 'error',
      'jest/prefer-hooks-on-top': 'error',
      'jest/prefer-jest-mocked': 'error',
      'jest/prefer-spy-on': 'error',
      'jest/require-to-throw-message': 'error',
      'jest/require-top-level-describe': 'error',
    },
  },
  {
    ignores: [
      '**/src/web/nextui/_next/**/*',
      '**/src/web/nextui/.next/**/*',
      '**/src/web/nextui/out/**/*',
      'dist/**/*',
      'site/.docusaurus/**/*',
      'site/build/**/*',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: {
      'react-hooks': reactHooks,
      'unused-imports': unusedImports,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/ban-types': 0,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'none',
          ignoreRestSiblings: false,
        },
      ],
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-var-requires': 0,
      curly: 'error',
      'no-case-declarations': 0,
      'no-control-regex': 0,
      'no-empty': 0,
      'no-unused-expressions': 'error',
      'no-useless-escape': 0,
      'prefer-const': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/no-negated-condition': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unused-imports/no-unused-imports': 'error',
    },
  },
  {
    files: ['examples/**'],
    rules: {
      '@typescript-eslint/no-namespace': 0,
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-unused-vars': 0,
    },
  },
];
