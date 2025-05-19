// @ts-check
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslint from '@eslint/js';
import jest from 'eslint-plugin-jest';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  ...tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked),
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
      'dist/**/*',
      'site/.docusaurus/**/*',
      'site/build/**/*',
      '**/venv/**/*',
      'examples/redteam-medical-agent/src/**/*',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/ban-types': 0,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          ignoreRestSiblings: false,
          vars: 'all',
          varsIgnorePattern: '^_',
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
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'react-refresh/only-export-components': 'warn',
      'unicorn/no-lonely-if': 'error',
      'unicorn/no-negated-condition': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unused-imports/no-unused-imports': 'error',
      // 250508(Will): Latent Type-info Errors;
      // These need to be addressed in separate PRs.
      '@typescript-eslint/await-thenable': 0,
      '@typescript-eslint/no-base-to-string': 0,
      '@typescript-eslint/no-duplicate-type-constituents': 0,
      '@typescript-eslint/no-floating-promises': 0,
      '@typescript-eslint/no-implied-eval': 0,
      '@typescript-eslint/no-misused-promises': 0,
      '@typescript-eslint/no-redundant-type-constituents': 0,
      '@typescript-eslint/no-unnecessary-type-assertion': 0,
      '@typescript-eslint/no-unsafe-argument': 0,
      '@typescript-eslint/no-unsafe-assignment': 0,
      '@typescript-eslint/no-unsafe-call': 0,
      '@typescript-eslint/no-unsafe-member-access': 0,
      '@typescript-eslint/no-unsafe-return': 0,
      '@typescript-eslint/only-throw-error': 0,
      '@typescript-eslint/prefer-promise-reject-errors': 0,
      '@typescript-eslint/require-await': 0,
      '@typescript-eslint/restrict-plus-operands': 0,
      '@typescript-eslint/restrict-template-expressions': 0,
      '@typescript-eslint/unbound-method': 0,
    },
  },
  {
    files: ['examples/**', 'site/**'],
    rules: {
      '@typescript-eslint/no-namespace': 0,
      '@typescript-eslint/no-require-imports': 0,
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/no-var-requires': 0,
    },
  },
];
