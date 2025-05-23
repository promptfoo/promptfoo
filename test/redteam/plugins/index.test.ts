import type { FetchWithCacheResult } from '../../../src/cache';
import { fetchWithCache } from '../../../src/cache';
import { VERSION } from '../../../src/constants';
import {
  PII_PLUGINS,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
  BASE_PLUGINS,
  ADDITIONAL_PLUGINS,
  HARM_PLUGINS,
} from '../../../src/redteam/constants';
import { Plugins } from '../../../src/redteam/plugins';
import { neverGenerateRemote, shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { getShortPluginId } from '../../../src/redteam/util';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/cache');
jest.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: { remote: false },
}));
jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test-url'),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));

function mockFetchResponse(result: any[]): FetchWithCacheResult<unknown> {
  return {
    data: { result },
    cached: false,
    status: 200,
    statusText: 'OK',
  };
}

describe('Plugins', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn().mockResolvedValue({
        output: 'Sample output',
        error: null,
      }),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    jest.clearAllMocks();
    jest.mocked(fetchWithCache).mockReset();
  });

  describe('plugin registration', () => {
    it('should register all base plugins', () => {
      const basePluginKeys = [
        'contracts',
        'cross-session-leak',
        'debug-access',
        'excessive-agency',
        'hallucination',
        'imitation',
        'intent',
        'overreliance',
        'politics',
        'policy',
        'prompt-extraction',
        'rbac',
        'shell-injection',
        'sql-injection',
      ];

      basePluginKeys.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all aligned harm plugins', () => {
      Object.keys(REDTEAM_PROVIDER_HARM_PLUGINS).forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all unaligned harm plugins', () => {
      Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS).forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all PII plugins', () => {
      PII_PLUGINS.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all remote plugins', () => {
      const remotePluginKeys = [
        'ascii-smuggling',
        'bfla',
        'bola',
        'competitors',
        'hijacking',
        'religion',
        'ssrf',
        'indirect-prompt-injection',
      ];

      remotePluginKeys.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });
  });

  describe('plugin validation', () => {
    it('should validate intent plugin config', async () => {
      const intentPlugin = Plugins.find((p) => p.key === 'intent');
      expect(() => intentPlugin?.validate?.({})).toThrow(
        'Intent plugin requires `config.intent` to be set',
      );
    });

    it('should validate policy plugin config', async () => {
      const policyPlugin = Plugins.find((p) => p.key === 'policy');
      expect(() => policyPlugin?.validate?.({})).toThrow(
        'Policy plugin requires `config.policy` to be set',
      );
    });

    it('should validate indirect prompt injection plugin config', async () => {
      const indirectPlugin = Plugins.find((p) => p.key === 'indirect-prompt-injection');
      expect(() => indirectPlugin?.validate?.({})).toThrow(
        'Indirect prompt injection plugin requires `config.indirectInjectionVar` to be set',
      );
    });
  });

  describe('remote generation', () => {
    it('should call remote generation with correct parameters', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);

      const mockResponse = {
        data: { result: [{ test: 'case' }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {},
            injectVar: 'testVar',
            n: 1,
            purpose: 'test',
            task: 'ssrf',
            version: VERSION,
            email: null,
          }),
        }),
        expect.any(Number),
      );
      expect(result).toEqual([{ test: 'case', metadata: { pluginId: 'ssrf' } }]);
    });

    it('should handle remote generation errors', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const plugin = Plugins.find((p) => p.key === 'contracts');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(result).toEqual([]);
    });

    it('should not modify assertions for non-harmful remote plugins', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(false);
      const originalTestCase = {
        assert: [
          {
            type: 'test',
            metric: 'Original',
          },
        ],
        vars: {
          testVar: 'test content',
        },
        metadata: {
          pluginId: 'ssrf',
        },
      };

      const mockResponse = mockFetchResponse([originalTestCase]);
      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(result).toHaveLength(1);
      expect(result?.[0]).toEqual(originalTestCase);
    });
  });

  describe('unaligned harm plugins', () => {
    it('should require remote generation', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(false);
      jest.mocked(neverGenerateRemote).mockReturnValue(true);

      const unalignedPlugin = Plugins.find(
        (p) => p.key === Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0],
      );

      await expect(
        unalignedPlugin?.action({
          provider: mockProvider,
          purpose: 'test',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        }),
      ).rejects.toThrow('requires remote generation to be enabled');
    });
  });

  describe('plugin metadata', () => {
    it('should correctly format pluginId using getShortPluginId', () => {
      const testCases = [
        { input: 'contracts', expected: 'contracts' },
        { input: 'excessive-agency', expected: 'excessive-agency' },
        { input: 'hallucination', expected: 'hallucination' },
        { input: 'harmful:privacy', expected: 'harmful:privacy' },
        { input: 'harmful:hate', expected: 'harmful:hate' },
        { input: 'pii:direct', expected: 'pii:direct' },
        { input: 'promptfoo:redteam:contracts', expected: 'contracts' },
        { input: 'promptfoo:redteam:harmful:privacy', expected: 'harmful:privacy' },
        { input: 'promptfoo:redteam:pii:direct', expected: 'pii:direct' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = getShortPluginId(input);
        expect(result).toBe(expected);
      });
    });

    it('should verify plugins exist', () => {
      const plugins = ['contracts', 'excessive-agency', 'prompt-extraction', 'pii:direct'];

      plugins.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });
  });

  describe('plugin registry completeness', () => {
    it('should have all plugins from constants registered', () => {
      const expectedPlugins = [
        ...BASE_PLUGINS,
        ...Object.keys(HARM_PLUGINS),
        ...PII_PLUGINS,
        ...ADDITIONAL_PLUGINS,
      ];

      expectedPlugins.forEach((pluginKey) => {
        const plugin = Plugins.find((p) => p.key === pluginKey);
        expect(plugin).toBeDefined();
      });

      expect(Plugins.length).toBeGreaterThanOrEqual(expectedPlugins.length);
    });

    it('should have unique plugin keys (except for bias:gender)', () => {
      const pluginKeys = Plugins.map((p) => p.key);
      const seenKeys = new Set<string>();
      const duplicateKeys: string[] = [];

      pluginKeys.forEach((key) => {
        if (seenKeys.has(key) && key !== 'bias:gender') {
          duplicateKeys.push(key);
        }
        seenKeys.add(key);
      });

      expect(duplicateKeys).toHaveLength(0);
    });
  });
});
