import type { Config } from 'jest';
import baseConfig from './jest.config';

const config: Config = {
  ...baseConfig,
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns || [])].filter(
    (s) => !s.includes('integration'),
  ),
};

export default config;
