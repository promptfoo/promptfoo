import * as fs from 'fs';

import dotenv from 'dotenv';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { setupEnv } from '../../src/util/env';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

describe('setupEnv', () => {
  let originalEnv: typeof process.env;
  let dotenvConfigSpy: MockInstance<
    (options?: dotenv.DotenvConfigOptions) => dotenv.DotenvConfigOutput
  >;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Ensure NODE_ENV is not set at the start of each test
    delete process.env.NODE_ENV;
    // Spy on dotenv.config to verify it's called with the right parameters
    dotenvConfigSpy = vi.spyOn(dotenv, 'config').mockImplementation(() => ({ parsed: {} }));
    // Mock file existence check - default to true for backward compat with existing tests
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  it('should call dotenv.config with quiet=true when envPath is undefined', async () => {
    setupEnv(undefined);

    expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
    expect(dotenvConfigSpy).toHaveBeenCalledWith({ quiet: true });
  });

  it('should call dotenv.config with path, override=true, and quiet=true when envPath is specified', async () => {
    const testEnvPath = '.env.test';

    setupEnv(testEnvPath);

    expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
    expect(dotenvConfigSpy).toHaveBeenCalledWith({
      path: testEnvPath,
      override: true,
      quiet: true,
    });
  });

  it('should load environment variables with override when specified env file has conflicting values', async () => {
    // Mock dotenv.config to simulate loading variables
    dotenvConfigSpy.mockImplementation((options?: dotenv.DotenvConfigOptions) => {
      if (options?.path === '.env.production') {
        if (options.override) {
          process.env.NODE_ENV = 'production';
        } else if (!process.env.NODE_ENV) {
          process.env.NODE_ENV = 'production';
        }
      } else {
        // Default .env file
        if (!process.env.NODE_ENV) {
          process.env.NODE_ENV = 'development';
        }
      }
      return { parsed: {} };
    });

    // First load the default .env (setting NODE_ENV to 'development')
    setupEnv(undefined);
    expect(process.env.NODE_ENV).toBe('development');

    // Then load .env.production with override (should change NODE_ENV to 'production')
    setupEnv('.env.production');
    expect(process.env.NODE_ENV).toBe('production');
  });

  describe('multi-file support', () => {
    it('should call dotenv.config with array of paths when multiple files specified', () => {
      const paths = ['.env', '.env.local'];

      setupEnv(paths);

      expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
      expect(dotenvConfigSpy).toHaveBeenCalledWith({
        path: paths,
        override: true,
        quiet: true,
      });
    });

    it('should call dotenv.config with single path (not array) when one file specified as array', () => {
      const paths = ['.env'];

      setupEnv(paths);

      expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
      expect(dotenvConfigSpy).toHaveBeenCalledWith({
        path: '.env',
        override: true,
        quiet: true,
      });
    });

    it('should throw error when specified file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => setupEnv('.env.missing')).toThrow('Environment file not found: .env.missing');
    });

    it('should throw error when any file in array does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '.env');

      expect(() => setupEnv(['.env', '.env.missing'])).toThrow(
        'Environment file not found: .env.missing',
      );
    });

    it('should validate all files exist before calling dotenv.config', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '.env');

      expect(() => setupEnv(['.env', '.env.missing'])).toThrow();
      expect(dotenvConfigSpy).not.toHaveBeenCalled();
    });

    it('should filter out empty strings from array', () => {
      setupEnv(['', '.env', '  ']);

      expect(dotenvConfigSpy).toHaveBeenCalledWith({
        path: '.env',
        override: true,
        quiet: true,
      });
    });

    it('should call default dotenv.config when array contains only empty strings', () => {
      setupEnv(['', '  ', '']);

      expect(dotenvConfigSpy).toHaveBeenCalledWith({ quiet: true });
    });

    it('should call default dotenv.config when given empty array', () => {
      setupEnv([]);

      expect(dotenvConfigSpy).toHaveBeenCalledWith({ quiet: true });
    });

    it('should expand comma-separated values within array elements', () => {
      // This simulates what Commander passes when using --env-file .env,.env.local
      setupEnv(['.env,.env.local']);

      expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
      expect(dotenvConfigSpy).toHaveBeenCalledWith({
        path: ['.env', '.env.local'],
        override: true,
        quiet: true,
      });
    });

    it('should handle mixed array with some comma-separated and some individual paths', () => {
      setupEnv(['.env,.env.local', '.env.production']);

      expect(dotenvConfigSpy).toHaveBeenCalledWith({
        path: ['.env', '.env.local', '.env.production'],
        override: true,
        quiet: true,
      });
    });
  });
});
