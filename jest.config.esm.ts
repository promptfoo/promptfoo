import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        target: 'ES2022',
      },
    }],
  },
  testEnvironment: 'node',
  collectCoverage: false,
  coverageDirectory: '.coverage',
  coverageProvider: 'v8',
  modulePathIgnorePatterns: ['<rootDir>/dist', '<rootDir>/examples', '<rootDir>/node_modules'],
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.esm.ts'],
  testPathIgnorePatterns: [
    '.*\\.test\\.tsx$',
    '.*\\.integration\\.test\\.ts$',
    '<rootDir>/dist',
    '<rootDir>/examples',
    '<rootDir>/node_modules',
    '<rootDir>/src/app',
  ],
};

export default config;