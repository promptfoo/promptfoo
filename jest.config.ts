import type { Config } from 'jest';

const config: Config = {
  collectCoverage: false,
  coverageDirectory: '.coverage',
  coverageProvider: 'v8',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist', '<rootDir>/examples', '<rootDir>/node_modules'],
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironmentOptions: {
    globalsCleanup: 'soft',
  },
  testPathIgnorePatterns: [
    '.*\\.integration\\.test\\.ts$',
    '<rootDir>/dist',
    '<rootDir>/examples',
    '<rootDir>/node_modules',
    '<rootDir>/src/app',
    // These tests are now run with Vitest (npm run test:vitest)
    '<rootDir>/test/assertions',
    '<rootDir>/test/codeScans',
    '<rootDir>/test/matchers',
    '<rootDir>/test/database',
    '<rootDir>/test/site',
    '<rootDir>/test/testCase',
    '<rootDir>/test/validators',
    '<rootDir>/test/utils',
    '<rootDir>/test/models',
    '<rootDir>/test/app',
    '<rootDir>/test/globalConfig',
    '<rootDir>/test/integrations',
    '<rootDir>/test/external',
    '<rootDir>/test/progress',
    '<rootDir>/test/types',
    '<rootDir>/test/providers',
    '<rootDir>/test/prompts',
    '<rootDir>/test/python',
    '<rootDir>/test/commands',
    '<rootDir>/test/server',
    '<rootDir>/test/tracing',
    '<rootDir>/test/util',
    '<rootDir>/test/redteam',
    '<rootDir>/test/logger.test.ts',
    '<rootDir>/test/cache.test.ts',
    '<rootDir>/test/account.test.ts',
    '<rootDir>/test/constants.test.ts',
    '<rootDir>/test/monkeyPatchFetch.test.ts',
    '<rootDir>/test/config-schema.test.ts',
    '<rootDir>/test/envars.test.ts',
    '<rootDir>/test/feedback.test.ts',
    '<rootDir>/test/checkNodeVersion.test.ts',
    '<rootDir>/test/csv.test.ts',
    '<rootDir>/test/index.test.ts',
    '<rootDir>/test/googleSheets.test.ts',
    '<rootDir>/test/microsoftSharepoint.test.ts',
    '<rootDir>/test/providers.slack.test.ts',
    '<rootDir>/test/rateLimit.test.ts',
    '<rootDir>/test/share.test.ts',
    '<rootDir>/test/updates.test.ts',
  ],
  transform: {
    '^.+\\.m?[tj]sx?$': '@swc/jest',
  },
  // Transform ESM-only packages in node_modules
  // Use a permissive pattern that transforms most ESM packages
  transformIgnorePatterns: [
    'node_modules/(?!(@sindresorhus|execa|strip-final-newline|npm-run-path|path-key|onetime|mimic-fn|human-signals|is-stream|merge-stream|get-stream|is-plain-obj|yocto-queue|figures|is-unicode-supported)/)',
  ],
  // Use a more conservative worker pool configuration to prevent segmentation faults
  maxWorkers: '50%',
  workerIdleMemoryLimit: '1GB',
};

export default config;
