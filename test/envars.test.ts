import { getEnvString, getEnvBool, getEnvInt, getEnvFloat } from '../src/envars';

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
  });
});
