import type { Config } from 'jest';

const config: Config = {
  collectCoverage: false,
  coverageDirectory: '.coverage',
  coverageProvider: 'v8',
  extensionsToTreatAsEsm: ['.ts'],
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
