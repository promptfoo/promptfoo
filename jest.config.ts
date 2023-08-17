/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
import type { Config } from 'jest';

const config: Config = {
  transform: {
    '\\.[jt]sx?$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleNameMapper: {
    '(.+)\\.js': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  testPathIgnorePatterns: ['<rootDir>/examples', '<rootDir>/node_modules', '<rootDir>/dist'],
};

export default config;
