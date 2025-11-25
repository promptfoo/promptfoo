import type { Config } from 'jest';
import baseConfig from './jest.config';

const config: Config = {
  ...baseConfig,
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    globalsCleanup: 'soft',
  },
  // Remove the *.integration.test.ts exclusion pattern, but keep the test/integrations directory excluded
  // (test/integrations now contains Vitest tests, not Jest integration tests)
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns || [])].filter(
    (s) => !s.includes('.integration.test.ts'),
  ),
};

export default config;
