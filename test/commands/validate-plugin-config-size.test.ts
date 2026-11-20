import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  doValidate,
  getOversizedRemotePluginConfigs,
  REMOTE_PLUGIN_CONFIG_MAX_BYTES,
} from '../../src/commands/validate';
import logger from '../../src/logger';
import { resolveConfigs } from '../../src/util/config/load';
import { mockProcessEnv } from '../util/utils';

import type { UnifiedConfig } from '../../src/types/index';

vi.mock('../../src/logger');
vi.mock('../../src/util/config/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/config/load')>()),
  resolveConfigs: vi.fn(),
}));
vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    send: vi.fn(),
  },
}));

const REMOTE_GENERATION_URL = 'https://remote-generation.example.test/api/v1/task';

function mockResolved(config: Record<string, unknown>): void {
  vi.mocked(resolveConfigs).mockResolvedValue({
    config: config as any,
    testSuite: {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      providers: [{ id: () => 'test-provider', callApi: () => Promise.resolve({}) }],
      tests: [{ vars: { test: 'value' } }],
    } as any,
    basePath: '/test',
  });
}

function configWithPlugin(pluginConfig: Record<string, unknown>, pluginId = 'prompt-extraction') {
  return {
    prompts: ['test prompt'],
    providers: ['test-provider'],
    tests: [{ vars: { test: 'value' } }],
    redteam: {
      plugins: [{ id: pluginId, config: pluginConfig }],
    },
  };
}

describe('validate plugin config size for remote generation (#12513)', () => {
  const defaultConfig = {} as UnifiedConfig;
  const defaultConfigPath = 'config.yaml';
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    restoreEnv = mockProcessEnv({
      PROMPTFOO_REMOTE_GENERATION_URL: REMOTE_GENERATION_URL,
      PROMPTFOO_DISABLE_REMOTE_GENERATION: undefined,
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.mocked(resolveConfigs).mockReset();
  });

  describe('getOversizedRemotePluginConfigs', () => {
    it('flags a plugin config over the remote limit', () => {
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin({ systemPrompt: 'x'.repeat(40_000) }) as unknown as UnifiedConfig,
      );
      expect(oversized).toHaveLength(1);
      expect(oversized[0].pluginId).toBe('prompt-extraction');
      expect(oversized[0].sizeBytes).toBeGreaterThan(REMOTE_PLUGIN_CONFIG_MAX_BYTES);
      expect(REMOTE_PLUGIN_CONFIG_MAX_BYTES).toBe(30000);
    });

    it('passes an oversized config for a local-only plugin (intent)', () => {
      // IntentPlugin sets canGenerateRemote = false, so its config never goes
      // to remote generation even when remote generation is selected globally.
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin({ intent: 'x'.repeat(40_000) }, 'intent') as unknown as UnifiedConfig,
      );
      expect(oversized).toEqual([]);
    });

    it('passes an oversized config for a local-only plugin referenced by its full id', () => {
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin(
          { intent: 'x'.repeat(40_000) },
          'promptfoo:redteam:intent',
        ) as unknown as UnifiedConfig,
      );
      expect(oversized).toEqual([]);
    });

    it('still flags an oversized config for a remote-capable plugin', () => {
      // prompt-extraction generates remotely, so the limit still applies.
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin(
          { systemPrompt: 'x'.repeat(40_000) },
          'prompt-extraction',
        ) as unknown as UnifiedConfig,
      );
      expect(oversized).toHaveLength(1);
      expect(oversized[0].pluginId).toBe('prompt-extraction');
    });

    it('measures UTF-8 bytes, not characters', () => {
      // 20,000 multi-byte chars: under 30,000 characters but over 30,000 bytes.
      const config = configWithPlugin({ systemPrompt: 'é'.repeat(20_000) });
      const serialized = JSON.stringify({ systemPrompt: 'é'.repeat(20_000) });
      expect(serialized.length).toBeLessThan(30000);
      expect(Buffer.byteLength(serialized, 'utf8')).toBeGreaterThan(30000);
      const oversized = getOversizedRemotePluginConfigs(config as unknown as UnifiedConfig);
      expect(oversized).toHaveLength(1);
      expect(oversized[0].sizeBytes).toBe(Buffer.byteLength(serialized, 'utf8'));
    });

    it('passes an under-limit plugin config', () => {
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin({ systemPrompt: 'short prompt' }) as unknown as UnifiedConfig,
      );
      expect(oversized).toEqual([]);
    });

    it('ignores plugins without a config and string shorthand plugins', () => {
      const oversized = getOversizedRemotePluginConfigs({
        redteam: {
          plugins: ['harmful', { id: 'pii' }],
        },
      } as unknown as UnifiedConfig);
      expect(oversized).toEqual([]);
    });

    it('does not count graderExamples, which are stripped before remote generation', () => {
      const graderExamples = 'g'.repeat(40_000);
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin({
          systemPrompt: 'short prompt',
          graderExamples,
        }) as unknown as UnifiedConfig,
      );
      expect(oversized).toEqual([]);
    });

    it('counts the max-chars modifier remote generation adds to the config', () => {
      // Pad the config to just under the limit, so only the added modifier tips it over.
      const padding = 'x'.repeat(30000 - Buffer.byteLength('{"systemPrompt":""}', 'utf8') - 50);
      const pluginConfig = { systemPrompt: padding, maxCharsPerMessage: 500 };
      expect(Buffer.byteLength(JSON.stringify({ systemPrompt: padding }), 'utf8')).toBeLessThan(
        30000,
      );
      const expectedSize = Buffer.byteLength(
        JSON.stringify({
          systemPrompt: padding,
          maxCharsPerMessage: 500,
          modifiers: {
            maxCharsPerMessage: 'Each generated user message must be 500 characters or fewer.',
          },
        }),
        'utf8',
      );
      expect(expectedSize).toBeGreaterThan(30000);
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin(pluginConfig) as unknown as UnifiedConfig,
      );
      expect(oversized).toHaveLength(1);
      expect(oversized[0].sizeBytes).toBe(expectedSize);
    });

    it('measures each language separately, not the whole language array', () => {
      // A near-limit prompt with 25 languages: over the limit only because the
      // array lists every language name, but each language-specific request
      // remote generation actually sends stays under it.
      const languages = [
        'en',
        'fr',
        'de',
        'es',
        'it',
        'pt',
        'nl',
        'sv',
        'da',
        'fi',
        'no',
        'pl',
        'cs',
        'sk',
        'hu',
        'ro',
        'bg',
        'hr',
        'sr',
        'sl',
        'et',
        'lv',
        'lt',
        'el',
        'tr',
      ];
      const pluginConfig = { systemPrompt: 'x'.repeat(29_900), language: languages };
      const wholeArraySize = Buffer.byteLength(JSON.stringify(pluginConfig), 'utf8');
      expect(wholeArraySize).toBeGreaterThan(REMOTE_PLUGIN_CONFIG_MAX_BYTES);
      const largestSingleLanguageSize = Buffer.byteLength(
        JSON.stringify({ systemPrompt: pluginConfig.systemPrompt, language: 'en' }),
        'utf8',
      );
      expect(largestSingleLanguageSize).toBeLessThan(REMOTE_PLUGIN_CONFIG_MAX_BYTES);
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin(pluginConfig) as unknown as UnifiedConfig,
      );
      expect(oversized).toEqual([]);
    });

    it('still flags a config over the limit for a single language', () => {
      const languages = ['en', 'fr', 'de'];
      const pluginConfig = { systemPrompt: 'x'.repeat(30_100), language: languages };
      const expectedSize = Buffer.byteLength(
        JSON.stringify({ systemPrompt: pluginConfig.systemPrompt, language: 'en' }),
        'utf8',
      );
      expect(expectedSize).toBeGreaterThan(REMOTE_PLUGIN_CONFIG_MAX_BYTES);
      const oversized = getOversizedRemotePluginConfigs(
        configWithPlugin(pluginConfig) as unknown as UnifiedConfig,
      );
      expect(oversized).toHaveLength(1);
      expect(oversized[0].pluginId).toBe('prompt-extraction');
      expect(oversized[0].sizeBytes).toBe(expectedSize);
    });
  });

  describe('doValidate', () => {
    it('fails validation when remote generation is selected and a plugin config is oversized', async () => {
      mockResolved(configWithPlugin({ systemPrompt: 'x'.repeat(40_000) }));
      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(process.exitCode).toBe(1);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Configuration is valid'),
      );
      const errorOutput = vi
        .mocked(logger.error)
        .mock.calls.map((call) => String(call[0]))
        .join('\n');
      expect(errorOutput).toContain('prompt-extraction');
      expect(errorOutput).toContain('30000');
      expect(errorOutput).toMatch(/40\d{3}/);
    });

    it('passes validation for an oversized local-only intent plugin config', async () => {
      mockResolved(configWithPlugin({ intent: 'x'.repeat(40_000) }, 'intent'));
      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(process.exitCode).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
    });

    it('passes validation when the plugin config is under the limit', async () => {
      mockResolved(configWithPlugin({ systemPrompt: 'short prompt' }));
      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(process.exitCode).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
    });

    it('passes validation when remote generation is disabled, even with an oversized config', async () => {
      const restoreDisabledEnv = mockProcessEnv({
        PROMPTFOO_REMOTE_GENERATION_URL: undefined,
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      });
      try {
        mockResolved(configWithPlugin({ systemPrompt: 'x'.repeat(40_000) }));
        await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

        expect(process.exitCode).toBe(0);
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
      } finally {
        restoreDisabledEnv();
      }
    });

    it('only names the oversized plugin when other plugins are fine', async () => {
      mockResolved({
        prompts: ['test prompt'],
        providers: ['test-provider'],
        tests: [{ vars: { test: 'value' } }],
        redteam: {
          plugins: [
            { id: 'harmful', config: { numTests: 5 } },
            { id: 'prompt-extraction', config: { systemPrompt: 'x'.repeat(40_000) } },
          ],
        },
      });
      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(process.exitCode).toBe(1);
      const errorOutput = vi
        .mocked(logger.error)
        .mock.calls.map((call) => String(call[0]))
        .join('\n');
      expect(errorOutput).toContain('prompt-extraction');
      expect(errorOutput).not.toContain('harmful');
    });
  });
});
