/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
import type { Config } from 'jest';

const config: Config = {
  collectCoverage: true,
  coverageDirectory: '.coverage',
  coverageProvider: 'v8',
  extensionsToTreatAsEsm: ['.ts'],
  modulePathIgnorePatterns: ['<rootDir>/examples', '<rootDir>/node_modules', '<rootDir>/dist'],
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  testPathIgnorePatterns: ['<rootDir>/examples', '<rootDir>/node_modules', '<rootDir>/dist'],
  transform: {
    '^.+\\.m?[tj]sx?$': '@swc/jest',
  },
};

export default config;
