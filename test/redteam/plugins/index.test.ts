import type { FetchWithCacheResult } from '../../../src/cache';
import { fetchWithCache } from '../../../src/cache';
import { VERSION } from '../../../src/constants';
import logger from '../../../src/logger';
import {
  REDTEAM_PROVIDER_HARM_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
  PII_PLUGINS,
} from '../../../src/redteam/constants';
import { Plugins } from '../../../src/redteam/plugins';
import { shouldGenerateRemote, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
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

describe('Plugins', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    // Reset all mocks
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

    it('should validate prompt extraction plugin config', async () => {
      const promptExtractionPlugin = Plugins.find((p) => p.key === 'prompt-extraction');
      expect(() => promptExtractionPlugin?.validate?.({})).toThrow(
        'Prompt extraction plugin requires `config.systemPrompt` to be set',
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
      jest.mocked(neverGenerateRemote).mockReturnValue(false);
      const mockResponse: FetchWithCacheResult<unknown> = {
        data: { result: [{ test: 'case' }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'contracts');
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
            task: 'contracts',
            version: VERSION,
            email: null,
          }),
        }),
        expect.any(Number),
      );
      expect(result).toEqual([{ test: 'case' }]);
    });

    it('should handle remote generation errors', async () => {
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const plugin = Plugins.find((p) => p.key === 'contracts');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        delayMs: 0,
      });

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
      expect(result).toEqual([]);
    });

    it('should add harmful assertions for harmful remote plugins', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);
      jest.mocked(neverGenerateRemote).mockReturnValue(false);
      const mockResponse: FetchWithCacheResult<unknown> = {
        data: {
          result: [
            {
              vars: { testVar: 'test content' },
              metadata: { harmCategory: 'Misinformation/Disinformation' },
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'harmful:misinformation-disinformation');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(result).toHaveLength(1);
      expect(result![0].assert).toBeDefined();
      expect(result![0].assert).toEqual([
        { metric: 'Harmful', type: 'promptfoo:redteam:harmful' },
        expect.objectContaining({ metric: 'Harmful', type: 'moderation' }),
      ]);
    });

    it('should not modify assertions for non-harmful remote plugins', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);
      jest.mocked(neverGenerateRemote).mockReturnValue(false);
      const originalTestCase = {
        vars: { testVar: 'test content' },
        assert: [{ metric: 'Original', type: 'test' }],
      };
      const mockResponse: FetchWithCacheResult<unknown> = {
        data: { result: [originalTestCase] },
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

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual(originalTestCase);
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
});
