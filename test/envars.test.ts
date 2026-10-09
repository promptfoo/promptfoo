import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import {
  getEnvBool,
  getEnvFloat,
  getEnvInt,
  getEnvOverrides,
  getEnvString,
  getMaxEvalTimeMs,
  getProcessEnv,
  getProviderEnvString,
  isCI,
} from '../src/envars';
import { setEnvOverridesProvider } from '../src/envOverrides';
import { mockProcessEnv } from './util/utils';

import type { EnvVarKey } from '../src/envars';
import type { EnvOverrides } from '../src/types/env';

describe('envars', () => {
  const originalEnv = { ...process.env };
  const originalCliState = { ...cliState };

  beforeEach(() => {
    vi.resetModules();
    mockProcessEnv({ ...originalEnv }, { clear: true });
    // Reset cliState to empty for each test
    Object.keys(cliState).forEach((key) => {
      delete cliState[key as keyof typeof cliState];
    });
    setEnvOverridesProvider(() => cliState.config?.env);
  });

  afterEach(() => {
    // Clear the throwing cliState mock used by the "without importing cliState" test
    // before the next test's beforeEach re-resolves modules.
    vi.doUnmock('../src/cliState');
  });

  afterAll(() => {
    mockProcessEnv(originalEnv, { clear: true });
    // Restore original cliState
    Object.keys(cliState).forEach((key) => {
      delete cliState[key as keyof typeof cliState];
    });
    Object.assign(cliState, originalCliState);
    // Symmetric teardown: leave the singleton "unregistered" rather than pointing
    // at a closure owned by this test file.
    setEnvOverridesProvider(undefined);
  });

  it.each([undefined, '', 0, false, null])(
    'reads only own provider override values: %s',
    (value) => {
      mockProcessEnv({ CUSTOM_KEY: 'ambient' });
      const key = 'CUSTOM_KEY' as EnvVarKey;
      const env = { CUSTOM_KEY: value } as unknown as EnvOverrides;
      expect(getProviderEnvString(env, key)).toBe(value === undefined ? undefined : String(value));
      expect(getProviderEnvString(Object.create({ CUSTOM_KEY: value }), key)).toBeUndefined();
      expect(getProviderEnvString(undefined, key)).toBeUndefined();
    },
  );

  describe('getEnvar', () => {
    it('should return the value of an existing environment variable', () => {
      mockProcessEnv({ PROMPTFOO_AUTHOR: 'test value' });
      expect(getEnvString('PROMPTFOO_AUTHOR')).toBe('test value');
    });

    it('should return undefined for a non-existing environment variable', () => {
      expect(getEnvString('PROMPTFOO_AUTHOR')).toBeUndefined();
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvString('PROMPTFOO_AUTHOR', 'default')).toBe('default');
    });

    it('should prioritize cliState.config.env over process.env', () => {
      mockProcessEnv({ OPENAI_API_KEY: 'process-env-key' });
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
      mockProcessEnv({ HTTP_PROXY: 'http://proxy.example.com:8080' });
      mockProcessEnv({ HTTPS_PROXY: 'https://proxy.example.com:8443' });

      expect(getEnvString('HTTP_PROXY')).toBe('http://proxy.example.com:8080');
      expect(getEnvString('HTTPS_PROXY')).toBe('https://proxy.example.com:8443');
    });

    it('should handle provider-specific environment variables', () => {
      mockProcessEnv({ CDP_DOMAIN: 'custom.domain' });
      mockProcessEnv({ PORTKEY_API_BASE_URL: 'https://api.portkey.example.com' });

      expect(getEnvString('CDP_DOMAIN')).toBe('custom.domain');
      expect(getEnvString('PORTKEY_API_BASE_URL')).toBe('https://api.portkey.example.com');
    });

    it('should handle arbitrary string keys not defined in EnvVars type', () => {
      mockProcessEnv({ CUSTOM_ENV_VAR: 'custom value' });
      expect(getEnvString('CUSTOM_ENV_VAR' as EnvVarKey)).toBe('custom value');
    });

    it('should read injected env overrides without importing cliState', async () => {
      vi.resetModules();
      vi.doMock('../src/cliState', () => {
        throw new Error('cliState should not be imported by envars');
      });

      const [{ getEnvString }, { setEnvOverridesProvider }] = await Promise.all([
        import('../src/envars'),
        import('../src/envOverrides'),
      ]);

      setEnvOverridesProvider(() => ({ OPENAI_API_KEY: 'provider-env-key' }));

      expect(getEnvString('OPENAI_API_KEY')).toBe('provider-env-key');
    });

    it('should fall through to process.env when no provider is registered', () => {
      mockProcessEnv({ OPENAI_API_KEY: 'process-env-key' });
      setEnvOverridesProvider(undefined);

      expect(getEnvString('OPENAI_API_KEY')).toBe('process-env-key');
    });

    it('should fall through to process.env when the provider returns undefined', () => {
      mockProcessEnv({ OPENAI_API_KEY: 'process-env-key' });
      setEnvOverridesProvider(() => undefined);

      expect(getEnvString('OPENAI_API_KEY')).toBe('process-env-key');
    });

    it('should fall through to process.env when the provider returns an empty record', () => {
      mockProcessEnv({ OPENAI_API_KEY: 'process-env-key' });
      setEnvOverridesProvider(() => ({}));

      expect(getEnvString('OPENAI_API_KEY')).toBe('process-env-key');
    });

    it('should swallow provider exceptions and fall through to process.env', () => {
      mockProcessEnv({ OPENAI_API_KEY: 'process-env-key' });
      setEnvOverridesProvider(() => {
        throw new Error('provider exploded');
      });

      expect(() => getEnvString('OPENAI_API_KEY')).not.toThrow();
      expect(getEnvString('OPENAI_API_KEY')).toBe('process-env-key');
    });

    it('should auto-register the provider when cliState is imported', async () => {
      vi.resetModules();

      // Resolve pending mock cleanup before importing cliState again.
      const dynEnvars = await import('../src/envars');
      const dynCliState = await import('../src/cliState');

      dynCliState.default.config = { env: { OPENAI_API_KEY: 'wired-key' } };

      expect(dynEnvars.getEnvOverrides()).toEqual({ OPENAI_API_KEY: 'wired-key' });
    });
  });

  describe('invocation environment views', () => {
    it('keeps child-process and suite environments separate without changing process.env', () => {
      mockProcessEnv({ CONTRACT_PARENT: 'parent', CONTRACT_INHERITED: 'parent' });
      const suite = { CONTRACT_PARENT: 'suite', CONTRACT_SUITE_ONLY: 'suite' };
      const file = {
        CONTRACT_PARENT: 'file',
        CONTRACT_FILE_ONLY: 'file',
        CONTRACT_INHERITED: undefined,
      };
      setEnvOverridesProvider((layer) => (layer === 'suite' ? suite : file));

      expect(getEnvOverrides()).toBe(suite);
      expect(getEnvOverrides('file')).toBe(file);
      const inherited = getProcessEnv();
      expect(inherited).toMatchObject({
        CONTRACT_PARENT: 'file',
        CONTRACT_FILE_ONLY: 'file',
        CONTRACT_INHERITED: 'parent',
      });
      expect(inherited).not.toHaveProperty('CONTRACT_SUITE_ONLY');
      expect(process.env.CONTRACT_PARENT).toBe('parent');
      expect(process.env).not.toHaveProperty('CONTRACT_FILE_ONLY');
    });

    it('keeps the parent environment when no invocation provider can supply overrides', () => {
      setEnvOverridesProvider(undefined);
      expect(getEnvOverrides()).toBeUndefined();
      expect(getProcessEnv()).toBe(process.env);

      setEnvOverridesProvider(() => {
        throw new Error('unavailable');
      });
      expect(getEnvOverrides('file')).toBeUndefined();
      expect(getProcessEnv()).toBe(process.env);
    });
  });

  describe('dotenv loading', () => {
    // Capture Windows TEMP/TMP before the test clears process.env.
    const tmpRoot = os.tmpdir();
    const envarsUrl = pathToFileURL(path.resolve(__dirname, '../src/envars.ts')).href;
    const tsxUrl = pathToFileURL(require.resolve('tsx')).href;

    async function withDotenvFixture(check: (file: string) => Promise<void>): Promise<void> {
      const restoreEnv = mockProcessEnv({
        DOTENV_PATH: undefined,
        DOTENV_CONFIG_PATH: undefined,
        PROMPTFOO_DOTENV_PROBE: undefined,
      });
      const originalCwd = process.cwd();
      const dir = fs.mkdtempSync(path.join(tmpRoot, 'promptfoo-dotenv-'));
      fs.writeFileSync(path.join(dir, '.env'), 'PROMPTFOO_DOTENV_PROBE=fixture\n');

      try {
        process.chdir(dir);
        vi.resetModules();
        await check(path.join(dir, '.env'));
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(dir, { recursive: true, force: true });
        restoreEnv();
      }
    }

    it.each([undefined, 'DOTENV_PATH', 'DOTENV_CONFIG_PATH'])(
      'does not load implicit files during imports (%s)',
      async (pathVariable) => {
        await withDotenvFixture(async (file) => {
          if (pathVariable) {
            mockProcessEnv({ [pathVariable]: file });
          }
          await import('../src/envars');
          expect(process.env.PROMPTFOO_DOTENV_PROBE).toBeUndefined();
        });
      },
    );

    it('does not load a .env file after a test clears process.env', async () => {
      const restoreEnv = mockProcessEnv({}, { clear: true });

      try {
        await withDotenvFixture(async () => {
          await import('../src/envars');
          expect(process.env.PROMPTFOO_DOTENV_PROBE).toBeUndefined();
        });
      } finally {
        restoreEnv();
      }
    });

    it.each([undefined, 'DOTENV_PATH', 'DOTENV_CONFIG_PATH'])(
      'does not load implicit files during command setup (%s)',
      async (pathVariable) => {
        await withDotenvFixture(async (file) => {
          if (pathVariable) {
            mockProcessEnv({ [pathVariable]: file });
          }
          const { setupEnv } = await import('../src/util/env');
          setupEnv(undefined);
          expect(process.env.PROMPTFOO_DOTENV_PROBE).toBeUndefined();
        });
      },
    );

    it('keeps default loading for downstream Vitest consumers', async () => {
      await withDotenvFixture(async () => {
        const output = execFileSync(
          process.execPath,
          [
            '--import',
            tsxUrl,
            '--input-type=module',
            '--eval',
            `globalThis.__vitest_worker__ = {};
             await import(${JSON.stringify(envarsUrl)});
             process.stdout.write(process.env.PROMPTFOO_DOTENV_PROBE ?? 'missing');`,
          ],
          {
            env: {
              VITEST: 'true',
              SystemRoot: process.env.SystemRoot,
              TMPDIR: tmpRoot,
              TMP: tmpRoot,
              TEMP: tmpRoot,
            },
            encoding: 'utf8',
          },
        );
        expect(output).toBe('fixture');
      });
    });

    it('still loads explicitly selected command fixtures', async () => {
      await withDotenvFixture(async (file) => {
        const { setupEnv } = await import('../src/util/env');
        setupEnv(file);
        expect(process.env.PROMPTFOO_DOTENV_PROBE).toBe('fixture');
      });
    });
  });

  describe('getEnvBool', () => {
    it('should return true for truthy string values', () => {
      ['1', 'true', 'yes', 'yup'].forEach((value) => {
        mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: value });
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
      });
    });

    it('should explicitly treat "yeppers" as a truthy value', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: 'yeppers' });
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
    });

    it('should return false for falsy string values', () => {
      ['0', 'false', 'no', 'nope'].forEach((value) => {
        mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: value });
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
      });
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED', true)).toBe(true);
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED', false)).toBe(false);
    });

    it('should return false for any other string values', () => {
      ['maybe', 'enabled', 'on'].forEach((value) => {
        mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: value });
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
      });
    });

    it('should return true when the environment variable is set to "1"', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: '1' });
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
    });

    it('should return false when the environment variable is set to "0"', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: '0' });
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
    });

    it('should return false when no default value is provided and the environment variable is not set', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: undefined });
      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(false);
    });

    it('should prioritize cliState.config.env over process.env for boolean values', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: 'false' });
      cliState.config = {
        env: {
          PROMPTFOO_CACHE_ENABLED: true as any,
        },
      };

      expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(true);
    });

    it('should handle arbitrary string keys for boolean values', () => {
      mockProcessEnv({ CUSTOM_BOOL_VAR: 'true' });
      expect(getEnvBool('CUSTOM_BOOL_VAR' as EnvVarKey)).toBe(true);
    });

    it('should handle PROMPTFOO_DISABLE_OBJECT_STRINGIFY environment variable', () => {
      expect(getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY')).toBe(false);

      mockProcessEnv({ PROMPTFOO_DISABLE_OBJECT_STRINGIFY: 'true' });
      expect(getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY')).toBe(true);

      mockProcessEnv({ PROMPTFOO_DISABLE_OBJECT_STRINGIFY: 'false' });
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
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '42' });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(42);
    });

    it('should return undefined for a non-numeric environment variable', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: 'not a number' });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBeUndefined();
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT', 100)).toBe(100);
    });

    it('should floor a floating-point number in the environment variable', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '42.7' });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(42);
    });

    it('should handle negative numbers', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '-42' });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(-42);
    });

    it('should return undefined for empty string', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '' });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBeUndefined();
    });

    it('should return the default value when the environment variable is undefined', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: undefined });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT', 100)).toBe(100);
    });

    it('should return undefined when no default value is provided and the environment variable is not set', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: undefined });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBeUndefined();
    });

    it('should prioritize cliState.config.env over process.env for integer values', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '100' });
      cliState.config = {
        env: {
          PROMPTFOO_CACHE_MAX_FILE_COUNT: 42 as any,
        },
      };

      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(42);
    });

    it('should handle arbitrary string keys for integer values', () => {
      mockProcessEnv({ CUSTOM_INT_VAR: '123' });
      expect(getEnvInt('CUSTOM_INT_VAR' as EnvVarKey)).toBe(123);
    });

    it('should return 0 when environment variable is set to "0"', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '0' });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT')).toBe(0);
    });

    it('should return 0 instead of default when environment variable is "0"', () => {
      mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '0' });
      expect(getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT', 100)).toBe(0);
    });
  });

  describe('getEnvFloat', () => {
    it('should return the float value of an existing environment variable', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: '3.14' });
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(3.14);
    });

    it('should return undefined for a non-numeric environment variable', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: 'not a number' });
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBeUndefined();
    });

    it('should return the default value for a non-existing environment variable', () => {
      expect(getEnvFloat('OPENAI_TEMPERATURE', 2.718)).toBe(2.718);
    });

    it('should handle integer values', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: '42' });
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(42);
    });

    it('should handle negative numbers', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: '-3.14' });
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(-3.14);
    });

    it('should return undefined for empty string', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: '' });
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBeUndefined();
    });

    it('should return the default value when the environment variable is undefined', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: undefined });
      expect(getEnvFloat('OPENAI_TEMPERATURE', 2.718)).toBe(2.718);
    });

    it('should return undefined when no default value is provided and the environment variable is not set', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: undefined });
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBeUndefined();
    });

    it('should return 0 when environment variable is set to "0"', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: '0' });
      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(0);
    });

    it('should return 0 instead of default when environment variable is "0"', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: '0' });
      expect(getEnvFloat('OPENAI_TEMPERATURE', 0.7)).toBe(0);
    });

    it('should prioritize cliState.config.env over process.env for float values', () => {
      mockProcessEnv({ OPENAI_TEMPERATURE: '1.0' });
      cliState.config = {
        env: {
          OPENAI_TEMPERATURE: 0.7 as any,
        },
      };

      expect(getEnvFloat('OPENAI_TEMPERATURE')).toBe(0.7);
    });

    it('should handle arbitrary string keys for float values', () => {
      mockProcessEnv({ CUSTOM_FLOAT_VAR: '3.14159' });
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
      'JENKINS_URL',
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
      ciEnvironments.forEach((env) => mockProcessEnv({ [env]: undefined }));
    });

    it('should return false when no CI environment variables are set', () => {
      expect(isCI()).toBe(false);
    });

    ciEnvironments.forEach((env) => {
      it(`should return true when ${env} is set to 'true'`, () => {
        mockProcessEnv({ [env]: 'true' });
        expect(isCI()).toBe(true);
      });

      it(`should return false when ${env} is set to 'false'`, () => {
        mockProcessEnv({ [env]: 'false' });
        expect(isCI()).toBe(false);
      });
    });

    it('should return true if any CI environment variable is set to true', () => {
      mockProcessEnv({ GITHUB_ACTIONS: 'true' });
      mockProcessEnv({ TRAVIS: 'false' });
      expect(isCI()).toBe(true);
    });

    it.each([
      ['CODEBUILD_BUILD_ID', 'fixture-project:12345678-1234-1234-1234-123456789abc'],
      ['BITBUCKET_COMMIT', '0123456789abcdef0123456789abcdef01234567'],
      ['TEAMCITY_VERSION', '2026.1.2'],
      ['JENKINS_URL', 'https://jenkins.example.invalid/'],
    ])('recognizes the documented %s identifier', (key, value) => {
      mockProcessEnv({ [key]: value });
      expect(isCI()).toBe(true);
    });

    it('should prioritize cliState.config.env over process.env for CI detection', () => {
      mockProcessEnv({ CI: 'false' });
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
      mockProcessEnv({ PROMPTFOO_MAX_EVAL_TIME_MS: '10000' });
      expect(getMaxEvalTimeMs()).toBe(10000);
    });

    it('should handle invalid values', () => {
      mockProcessEnv({ PROMPTFOO_MAX_EVAL_TIME_MS: 'invalid' });
      expect(getMaxEvalTimeMs(5000)).toBe(5000);
    });

    it('should prioritize cliState.config.env over process.env', () => {
      mockProcessEnv({ PROMPTFOO_MAX_EVAL_TIME_MS: '5000' });
      cliState.config = {
        env: {
          PROMPTFOO_MAX_EVAL_TIME_MS: 10000 as any,
        },
      };
      expect(getMaxEvalTimeMs()).toBe(10000);
    });

    it('should floor floating point values', () => {
      mockProcessEnv({ PROMPTFOO_MAX_EVAL_TIME_MS: '1234.56' });
      expect(getMaxEvalTimeMs()).toBe(1234);
    });

    it('should handle negative values', () => {
      mockProcessEnv({ PROMPTFOO_MAX_EVAL_TIME_MS: '-1000' });
      expect(getMaxEvalTimeMs()).toBe(-1000);
    });

    it('should handle empty string', () => {
      mockProcessEnv({ PROMPTFOO_MAX_EVAL_TIME_MS: '' });
      expect(getMaxEvalTimeMs(1000)).toBe(1000);
    });
  });
});
