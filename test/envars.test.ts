import cliState from '../src/cliState';
import {
  getEnvBool,
  getEnvFloat,
  getEnvInt,
  getEnvString,
  getMaxEvalTimeMs,
  isCI,
} from '../src/envars';

import type { EnvVarKey } from '../src/envars';

describe('envars', () => {
  const originalEnv = process.env;
  const originalCliState = { ...cliState };

  beforeEach(() => {
    jest.resetModules();
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
});
