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
  moduleNameMapper: {
    // converts imports for .js files except for jest.mock('../test.js')
    // See https://github.com/swc-project/jest/issues/64#issuecomment-1029753225
    // (mirror https://lightrun.com/answers/swc-project-jest-es-import-of-typescript-with-js-extension-fails)
    [/^(?!\.\.\/test\.js)(\.{1,2}\/.*)\.js$/.source]: '$1',
  },
  transform: {
    '^.+\\.m?[tj]sx?$': '@swc/jest',
  },
};

export default config;
