/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
import type { Config } from 'jest';
import type { TsJestTransformerOptions } from 'ts-jest';

const tsJestConfig: TsJestTransformerOptions & Record<string, unknown> = { useESM: true };

const config: Config = {
  transform: {
    '^.+\\.m?[tj]sx?$': ['ts-jest', tsJestConfig],
    '^.+\\.(js)$': 'babel-jest',
  },
  /*
  moduleNameMapper: {
    '(.+)\\.js': '$1',
  },
  */
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  testPathIgnorePatterns: ['<rootDir>/examples', '<rootDir>/node_modules', '<rootDir>/dist'],
  modulePathIgnorePatterns: ['<rootDir>/examples', '<rootDir>/node_modules', '<rootDir>/dist'],
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill))',
  ],
  verbose: true,
};

export default config;
