/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
import type { Config } from 'jest';

const config: Config = {
  collectCoverage: false,
  coverageDirectory: '.coverage',
  coverageProvider: 'v8',
  extensionsToTreatAsEsm: ['.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist', '<rootDir>/examples', '<rootDir>/node_modules'],
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: [
    '.*\\.test\\.tsx$',
    '.*\\.integration\\.test\\.ts$',
    '<rootDir>/dist',
    '<rootDir>/examples',
    '<rootDir>/node_modules',
  ],
  transform: {
    '^.+\\.m?[tj]sx?$': '@swc/jest',
  },
  // Ensure Jest can resolve our mock modules
  moduleDirectories: ['node_modules', 'src'],
  // Explicitly tell Jest to use manual mocks
  automock: false,
  // Mock modules that are causing issues
  moduleNameMapper: {
    '^src/globalConfig/(.*)$': '<rootDir>/src/__mocks__/globalConfig/$1',
  },
};

export default config;
