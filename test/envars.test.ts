import { getEnvString, getEnvBool, getEnvInt, getEnvFloat, isCI } from '../src/envars';

describe('envars', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
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
  });
});
