import type { Config } from 'jest';
import baseConfig from './jest.config';

const config: Config = {
  ...baseConfig,
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    globalsCleanup: 'soft',
  },
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns || [])].filter(
    (s) => !s.includes('integration'),
  ),
};

export default config;
