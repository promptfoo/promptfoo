import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import {
  calculateDefaultMaxEvalTimeMs,
  EVAL_TIMEOUT_MULTIPLIER,
  EXPECTED_TIME_PER_REDTEAM_TEST_MS,
  EXPECTED_TIME_PER_TEST_MS,
  getDefaultMaxEvalTimeMs,
  getEnvBool,
  getEnvFloat,
  getEnvInt,
  getEnvString,
  getEvalTimeoutMs,
  getMaxEvalTimeMs,
  isCI,
  MAX_EVAL_TIME_BUFFER_MS,
  MAX_EVAL_TIME_REDTEAM_SAFETY_MULTIPLIER,
  MAX_EVAL_TIME_SAFETY_MULTIPLIER,
} from '../src/envars';

import type { EnvVarKey } from '../src/envars';

describe('envars', () => {
  const originalEnv = process.env;
  const originalCliState = { ...cliState };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Reset cliState to empty for each test
    Object.keys(cliState).forEach((key) => {
      delete cliState[key as keyof typeof cliState];
    });
  });

  afterAll(() => {
    process.env = originalEnv;
    // Restore original cliState
    Object.keys(cliState).forEach((key) => {
      delete cliState[key as keyof typeof cliState];
    });
    Object.assign(cliState, originalCliState);
  });

  describe('getEnvar', () => {
    it('should return the value of an existing environment variable', () => {
      process.env.PROMPTFOO_AUTHOR = 'test value';
      expect(getEnvString('PROMPTFOO_AUTHOR')).toBe('test value');
    });

    it('should return undefined for a non-existing environment variable', () => {
      expect(getEnvString('PROMPTFOO_AUTHOR')).toBeUndefined();
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvString('PROMPTFOO_AUTHOR', 'default')).toBe('default');
    });

    it('should prioritize cliState.config.env over process.env', () => {
      process.env.OPENAI_API_KEY = 'process-env-key';
      cliState.config = {
        env: {
          OPENAI_API_KEY: 'config-env-key',
        },
      };

      expect(getEnvString('OPENAI_API_KEY')).toBe('config-env-key');
    });

    it('should convert non-string values from cliState.config.env to strings', () => {
      cliState.config = {
        env: {
          OPENAI_TEMPERATURE: 0.7 as any,
          PROMPTFOO_CACHE_ENABLED: true as any,
        },
      };

      expect(getEnvString('OPENAI_TEMPERATURE')).toBe('0.7');
      expect(getEnvString('PROMPTFOO_CACHE_ENABLED')).toBe('true');
    });

    it('should handle HTTP proxy environment variables', () => {
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080';
      process.env.HTTPS_PROXY = 'https://proxy.example.com:8443';

      expect(getEnvString('HTTP_PROXY')).toBe('http://proxy.example.com:8080');
      expect(getEnvString('HTTPS_PROXY')).toBe('https://proxy.example.com:8443');
    });

    it('should handle provider-specific environment variables', () => {
      process.env.CDP_DOMAIN = 'custom.domain';
      process.env.PORTKEY_API_BASE_URL = 'https://api.portkey.example.com';

      expect(getEnvString('CDP_DOMAIN')).toBe('custom.domain');
      expect(getEnvString('PORTKEY_API_BASE_URL')).toBe('https://api.portkey.example.com');
    });

    it('should handle arbitrary string keys not defined in EnvVars type', () => {
      process.env.CUSTOM_ENV_VAR = 'custom value';
      expect(getEnvString('CUSTOM_ENV_VAR' as EnvVarKey)).toBe('custom value');
    });
  });

  describe('getEnvBool', () => {
    it('should return true for truthy string values', () => {
      ['1', 'true', 'yes', 'yup', 'yeppers'].forEach((value) => {
        process.env.PROMPTFOO_CACHE_ENABLED = value;
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
      });
    });

    it('should return false for falsy string values', () => {
      ['0', 'false', 'no', 'nope'].forEach((value) => {
        process.env.PROMPTFOO_CACHE_ENABLED = value;
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
      });
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED', true)).toBe(true);
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED', false)).toBe(false);
    });

    it('should return true for uppercase truthy string values', () => {
      ['TRUE', 'YES', 'YUP', 'YEPPERS'].forEach((value) => {
        process.env.PROMPTFOO_CACHE_ENABLED = value;
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
      });
    });

    it('should return false for any other string values', () => {
      ['maybe', 'enabled', 'on'].forEach((value) => {
        process.env.PROMPTFOO_CACHE_ENABLED = value;
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
      });
    });

    it('should return true when the environment variable is set to "1"', () => {
      process.env.PROMPTFOO_CACHE_ENABLED = '1';
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
    });

    it('should return false when the environment variable is set to "0"', () => {
      process.env.PROMPTFOO_CACHE_ENABLED = '0';
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
    });

    it('should return false when no default value is provided and the environment variable is not set', () => {
      delete process.env.PROMPTFOO_CACHE_ENABLED;
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
    });

    it('should prioritize cliState.config.env over process.env for boolean values', () => {
      process.env.PROMPTFOO_CACHE_ENABLED = 'false';
      cliState.config = {
        env: {
          PROMPTFOO_CACHE_ENABLED: true as any,
        },
      };

      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
    });

    it('should handle arbitrary string keys for boolean values', () => {
      process.env.CUSTOM_BOOL_VAR = 'true';
      expect(getEnvBool('CUSTOM_BOOL_VAR' as EnvVarKey)).toBe(true);
    });

    it('should handle PROMPTFOO_DISABLE_OBJECT_STRINGIFY environment variable', () => {
      expect(getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY')).toBe(false);

      process.env.PROMPTFOO_DISABLE_OBJECT_STRINGIFY = 'true';
      expect(getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY')).toBe(true);

      process.env.PROMPTFOO_DISABLE_OBJECT_STRINGIFY = 'false';
      expect(getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY')).toBe(false);

      cliState.config = {
        env: {
          PROMPTFOO_DISABLE_OBJECT_STRINGIFY: true as any,
        },
      };
      expect(getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY')).toBe(true);
    });
  });

  describe('getEnvInt', () => {
    it('should return the integer value of an existing environment variable', () => {
      process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT = '42';
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(42);
    });

    it('should return undefined for a non-numeric environment variable', () => {
      process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT = 'not a number';
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBeUndefined();
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT', 100)).toBe(100);
    });

    it('should floor a floating-point number in the environment variable', () => {
      process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT = '42.7';
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(42);
    });

    it('should handle negative numbers', () => {
      process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT = '-42';
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(-42);
    });

    it('should return undefined for empty string', () => {
      process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT = '';
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBeUndefined();
    });

    it('should return the default value when the environment variable is undefined', () => {
      delete process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT;
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT', 100)).toBe(100);
    });

    it('should return undefined when no default value is provided and the environment variable is not set', () => {
      delete process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT;
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBeUndefined();
    });

    it('should prioritize cliState.config.env over process.env for integer values', () => {
      process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT = '100';
      cliState.config = {
        env: {
          PROMPTFOO_CACHE_MAX_FILE_COUNT: 42 as any,
        },
      };

      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(42);
    });

    it('should handle arbitrary string keys for integer values', () => {
      process.env.CUSTOM_INT_VAR = '123';
      expect(getEnvInt('CUSTOM_INT_VAR' as EnvVarKey)).toBe(123);
    });
  });

  describe('getEnvFloat', () => {
    it('should return the float value of an existing environment variable', () => {
      process.env.OPENAI_TEMPERATURE = '3.14';
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(3.14);
    });

    it('should return undefined for a non-numeric environment variable', () => {
      process.env.OPENAI_TEMPERATURE = 'not a number';
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBeUndefined();
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvFloat('OPENAI_TEMPERATURE', 2.718)).toBe(2.718);
    });

    it('should handle integer values', () => {
      process.env.OPENAI_TEMPERATURE = '42';
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(42);
    });

    it('should handle negative numbers', () => {
      process.env.OPENAI_TEMPERATURE = '-3.14';
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(-3.14);
    });

    it('should return undefined for empty string', () => {
      process.env.OPENAI_TEMPERATURE = '';
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBeUndefined();
    });

    it('should return the default value when the environment variable is undefined', () => {
      delete process.env.OPENAI_TEMPERATURE;
      expect(getEnvFloat('OPENAI_TEMPERATURE', 2.718)).toBe(2.718);
    });

    it('should return undefined when no default value is provided and the environment variable is not set', () => {
      delete process.env.OPENAI_TEMPERATURE;
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBeUndefined();
    });

    it('should prioritize cliState.config.env over process.env for float values', () => {
      process.env.OPENAI_TEMPERATURE = '1.0';
      cliState.config = {
        env: {
          OPENAI_TEMPERATURE: 0.7 as any,
        },
      };

      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(0.7);
    });

    it('should handle arbitrary string keys for float values', () => {
      process.env.CUSTOM_FLOAT_VAR = '3.14159';
      expect(getEnvFloat('CUSTOM_FLOAT_VAR' as EnvVarKey)).toBe(3.14159);
    });
  });

  describe('isCI', () => {
    const ciEnvironments = [
      'CI',
      'GITHUB_ACTIONS',
      'TRAVIS',
      'CIRCLECI',
      'JENKINS',
      'GITLAB_CI',
      'APPVEYOR',
      'CODEBUILD_BUILD_ID',
      'TF_BUILD',
      'BITBUCKET_COMMIT',
      'BUDDY',
      'BUILDKITE',
      'TEAMCITY_VERSION',
    ];

    beforeEach(() => {
      // Clear all CI-related environment variables before each test
      ciEnvironments.forEach((env) => delete process.env[env]);
    });

    it('should return false when no CI environment variables are set', () => {
      expect(isCI()).toBe(false);
    });

    ciEnvironments.forEach((env) => {
      it(`should return true when ${env} is set to 'true'`, () => {
        process.env[env] = 'true';
        expect(isCI()).toBe(true);
      });

      it(`should return false when ${env} is set to 'false'`, () => {
        process.env[env] = 'false';
        expect(isCI()).toBe(false);
      });
    });

    it('should return true if any CI environment variable is set to true', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.TRAVIS = 'false';
      expect(isCI()).toBe(true);
    });

    it('should prioritize cliState.config.env over process.env for CI detection', () => {
      process.env.CI = 'false';
      cliState.config = {
        env: {
          CI: 'true',
        },
      };

      expect(isCI()).toBe(true);
    });
  });

  describe('getMaxEvalTimeMs', () => {
    it('should return default value when environment variable is not set', () => {
      expect(getMaxEvalTimeMs()).toBe(0);
      expect(getMaxEvalTimeMs(5000)).toBe(5000);
    });

    it('should return parsed integer value from environment variable', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '10000';
      expect(getMaxEvalTimeMs()).toBe(10000);
    });

    it('should handle invalid values', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = 'invalid';
      expect(getMaxEvalTimeMs(5000)).toBe(5000);
    });

    it('should prioritize cliState.config.env over process.env', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '5000';
      cliState.config = {
        env: {
          PROMPTFOO_MAX_EVAL_TIME_MS: 10000 as any,
        },
      };
      expect(getMaxEvalTimeMs()).toBe(10000);
    });

    it('should floor floating point values', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '1234.56';
      expect(getMaxEvalTimeMs()).toBe(1234);
    });

    it('should handle negative values', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '-1000';
      expect(getMaxEvalTimeMs()).toBe(-1000);
    });

    it('should handle empty string', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '';
      expect(getMaxEvalTimeMs(1000)).toBe(1000);
    });
  });

  describe('getEvalTimeoutMs', () => {
    it('should return default calculated value (5x REQUEST_TIMEOUT_MS)', () => {
      // Default REQUEST_TIMEOUT_MS is 300,000ms
      // 5 * 300,000 = 1,500,000ms (25 minutes)
      expect(getEvalTimeoutMs()).toBe(1_500_000);
    });

    it('should use custom REQUEST_TIMEOUT_MS when set', () => {
      process.env.REQUEST_TIMEOUT_MS = '60000';
      // 5 * 60,000 = 300,000ms (5 minutes)
      expect(getEvalTimeoutMs()).toBe(300_000);
    });

    it('should return explicit PROMPTFOO_EVAL_TIMEOUT_MS value when set', () => {
      process.env.PROMPTFOO_EVAL_TIMEOUT_MS = '120000';
      expect(getEvalTimeoutMs()).toBe(120000);
    });

    it('should return 0 when PROMPTFOO_EVAL_TIMEOUT_MS is explicitly set to 0', () => {
      process.env.PROMPTFOO_EVAL_TIMEOUT_MS = '0';
      expect(getEvalTimeoutMs()).toBe(0);
    });

    it('should return passed default value when no env var is set', () => {
      expect(getEvalTimeoutMs(500000)).toBe(500000);
    });

    it('should prioritize explicit value over passed default', () => {
      process.env.PROMPTFOO_EVAL_TIMEOUT_MS = '100000';
      expect(getEvalTimeoutMs(500000)).toBe(100000);
    });

    it('should prioritize cliState.config.env over process.env', () => {
      process.env.PROMPTFOO_EVAL_TIMEOUT_MS = '100000';
      cliState.config = {
        env: {
          PROMPTFOO_EVAL_TIMEOUT_MS: 200000 as any,
        },
      };
      expect(getEvalTimeoutMs()).toBe(200000);
    });

    it('should verify EVAL_TIMEOUT_MULTIPLIER is 5', () => {
      expect(EVAL_TIMEOUT_MULTIPLIER).toBe(5);
    });
  });

  describe('calculateDefaultMaxEvalTimeMs', () => {
    it('should calculate correct time for small regular eval', () => {
      // 10 tests, concurrency 4, 25 min timeout, not redteam
      // batchCount = ceil(10/4) = 3
      // expectedTime = 3 * 60,000 = 180,000
      // safeMaxTime = 180,000 * 3 + 60,000 = 600,000
      // worstCase = 3 * 1,500,000 = 4,500,000
      // min(600,000, 4,500,000) = 600,000
      const result = calculateDefaultMaxEvalTimeMs(10, 4, 1_500_000, false);
      expect(result).toBe(600_000);
    });

    it('should calculate correct time for large regular eval', () => {
      // 100 tests, concurrency 10, 25 min timeout, not redteam
      // batchCount = ceil(100/10) = 10
      // expectedTime = 10 * 60,000 = 600,000
      // safeMaxTime = 600,000 * 3 + 60,000 = 1,860,000
      // worstCase = 10 * 1,500,000 = 15,000,000
      // min(1,860,000, 15,000,000) = 1,860,000
      const result = calculateDefaultMaxEvalTimeMs(100, 10, 1_500_000, false);
      expect(result).toBe(1_860_000);
    });

    it('should calculate correct time for redteam eval', () => {
      // 10 tests, concurrency 4, 25 min timeout, redteam
      // batchCount = ceil(10/4) = 3
      // expectedTime = 3 * 300,000 = 900,000
      // safeMaxTime = 900,000 * 2 + 60,000 = 1,860,000
      // worstCase = 3 * 1,500,000 = 4,500,000
      // min(1,860,000, 4,500,000) = 1,860,000
      const result = calculateDefaultMaxEvalTimeMs(10, 4, 1_500_000, true);
      expect(result).toBe(1_860_000);
    });

    it('should use longer expected time for redteam', () => {
      expect(EXPECTED_TIME_PER_REDTEAM_TEST_MS).toBe(300_000);
      expect(EXPECTED_TIME_PER_TEST_MS).toBe(60_000);
      expect(EXPECTED_TIME_PER_REDTEAM_TEST_MS).toBeGreaterThan(EXPECTED_TIME_PER_TEST_MS);
    });

    it('should use lower safety multiplier for redteam', () => {
      expect(MAX_EVAL_TIME_REDTEAM_SAFETY_MULTIPLIER).toBe(2);
      expect(MAX_EVAL_TIME_SAFETY_MULTIPLIER).toBe(3);
      expect(MAX_EVAL_TIME_REDTEAM_SAFETY_MULTIPLIER).toBeLessThan(MAX_EVAL_TIME_SAFETY_MULTIPLIER);
    });

    it('should include buffer time', () => {
      expect(MAX_EVAL_TIME_BUFFER_MS).toBe(60_000);
    });

    it('should handle concurrency of 1', () => {
      // 5 tests, concurrency 1
      // batchCount = 5
      // expectedTime = 5 * 60,000 = 300,000
      // safeMaxTime = 300,000 * 3 + 60,000 = 960,000
      const result = calculateDefaultMaxEvalTimeMs(5, 1, 1_500_000, false);
      expect(result).toBe(960_000);
    });

    it('should handle concurrency of 0 (treated as 1)', () => {
      // 5 tests, concurrency 0 (should be treated as 1)
      const result = calculateDefaultMaxEvalTimeMs(5, 0, 1_500_000, false);
      // Same as concurrency 1
      expect(result).toBe(960_000);
    });

    it('should cap at worst case when calculated time exceeds it', () => {
      // 2 tests, concurrency 2, very short timeout (1 second)
      // batchCount = 1
      // expectedTime = 1 * 60,000 = 60,000
      // safeMaxTime = 60,000 * 3 + 60,000 = 240,000
      // worstCase = 1 * 1,000 = 1,000
      // min(240,000, 1,000) = 1,000
      const result = calculateDefaultMaxEvalTimeMs(2, 2, 1_000, false);
      expect(result).toBe(1_000);
    });
  });

  describe('getDefaultMaxEvalTimeMs', () => {
    it('should return explicit env var value when set', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '500000';
      expect(getDefaultMaxEvalTimeMs(10, 4, 1_500_000, false)).toBe(500000);
    });

    it('should return 0 when PROMPTFOO_MAX_EVAL_TIME_MS is explicitly set to 0', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '0';
      expect(getDefaultMaxEvalTimeMs(10, 4, 1_500_000, false)).toBe(0);
    });

    it('should calculate default when env var is not set', () => {
      delete process.env.PROMPTFOO_MAX_EVAL_TIME_MS;
      // Should use calculateDefaultMaxEvalTimeMs
      const result = getDefaultMaxEvalTimeMs(10, 4, 1_500_000, false);
      const expected = calculateDefaultMaxEvalTimeMs(10, 4, 1_500_000, false);
      expect(result).toBe(expected);
    });

    it('should prioritize cliState.config.env over process.env', () => {
      process.env.PROMPTFOO_MAX_EVAL_TIME_MS = '100000';
      cliState.config = {
        env: {
          PROMPTFOO_MAX_EVAL_TIME_MS: 200000 as any,
        },
      };
      expect(getDefaultMaxEvalTimeMs(10, 4, 1_500_000, false)).toBe(200000);
    });

    it('should pass isRedteam flag to calculateDefaultMaxEvalTimeMs', () => {
      delete process.env.PROMPTFOO_MAX_EVAL_TIME_MS;
      const regularResult = getDefaultMaxEvalTimeMs(10, 4, 1_500_000, false);
      const redteamResult = getDefaultMaxEvalTimeMs(10, 4, 1_500_000, true);
      // Redteam should have longer timeout due to different expected time
      expect(redteamResult).toBeGreaterThan(regularResult);
    });
  });
});
