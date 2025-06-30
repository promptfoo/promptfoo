/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
import type { Config } from 'jest';

// Try to detect if we're in a CI environment where SWC might not work
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Use different transformers based on environment
const transform = isCI 
  ? {
      '^.+\\.m?tsx?$': ['ts-jest', {
        useESM: true,
        tsconfig: {
          module: 'ES2022',
          target: 'ES2022',
          allowJs: true,
        },
      }],
    }
  : {
      '^.+\\.m?[tj]sx?$': [
        '@swc/jest',
        {
          jsc: {
            target: 'es2022',
            parser: {
              syntax: 'typescript',
              decorators: true,
            },
            transform: {
              legacyDecorator: true,
              decoratorMetadata: true,
            },
          },
          module: {
            type: 'es6',
          },
        },
      ],
    };

const config: Config = {
  collectCoverage: false,
  coverageDirectory: '.coverage',
  coverageProvider: 'v8',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  modulePathIgnorePatterns: ['<rootDir>/dist', '<rootDir>/examples', '<rootDir>/node_modules'],
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '.*\\.test\\.tsx$',
    '.*\\.integration\\.test\\.ts$',
    '<rootDir>/dist',
    '<rootDir>/examples',
    '<rootDir>/node_modules',
    '<rootDir>/src/app',
  ],
  transform,
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|ansi-styles|@types|strip-ansi|ansi-regex|supports-color|has-flag|inquirer|@inquirer|wrap-ansi|string-width|strip-ansi|ansi-regex|is-fullwidth-code-point|emoji-regex|eastasianwidth)/)',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

export default config;
