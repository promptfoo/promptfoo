/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
import type { Config } from 'jest';
import type { TsJestTransformerOptions } from 'ts-jest';

const tsJestConfig: TsJestTransformerOptions & Record<string, unknown> = { useESM: true };

const config: Config = {
  transform: {
    '^.+\\.m?[tj]sx?$': ['ts-jest', tsJestConfig],
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
};

export default config;
