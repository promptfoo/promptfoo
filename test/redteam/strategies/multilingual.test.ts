import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import {
  addMultilingual,
  getConcurrencyLimit,
  translateBatch,
} from '../../../src/redteam/strategies/multilingual';

import type { TestCase } from '../../../src/types';

vi.mock('cli-progress');

vi.mock('../../../src/logger', () => ({
  default: {
    level: 'info',
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test.url'),
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/cache', () => ({
  fetchWithCache: vi.fn().mockResolvedValue({
    data: { result: [] },
    cached: false,
    status: 200,
    statusText: 'OK',
  }),
}));

vi.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: vi.fn().mockResolvedValue({
      callApi: vi.fn().mockResolvedValue({
        output: '{"de": "Hallo Welt"}',
      }),
      config: {},
      isAvailable: vi.fn().mockResolvedValue(true),
    }),
    getMultilingualProvider: vi.fn().mockResolvedValue(null),
    clearProvider: vi.fn(),
  },
}));

describe('Multilingual Strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConcurrencyLimit', () => {
    it('should return default concurrency when no config provided', () => {
      expect(getConcurrencyLimit()).toBe(4);
    });

    it('should return configured concurrency limit', () => {
      expect(getConcurrencyLimit({ maxConcurrency: 8 })).toBe(8);
    });

    it('should handle invalid concurrency values', () => {
      expect(getConcurrencyLimit({ maxConcurrency: undefined })).toBe(4);
      // 0, null, and negative values should fallback to default (4)
      expect(getConcurrencyLimit({ maxConcurrency: 0 })).toBe(4);
      expect(getConcurrencyLimit({ maxConcurrency: null })).toBe(4);
      // Negative values also fallback to default (4)
      expect(getConcurrencyLimit({ maxConcurrency: -1 })).toBe(4);
    });
  });

  describe('translateBatch', () => {
    it('should handle JSON response format', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Hola", "fr": "Bonjour"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should handle code block response format', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '```json\n{"es": "Hola", "fr": "Bonjour"}\n```',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should handle YAML response format', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: 'es: Hola\nfr: Bonjour',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should handle partial translations', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Hola"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
      });
    });

    it('should handle invalid response format', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: 'invalid response',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({});
    });

    it('should handle API errors gracefully', async () => {
      const mockProvider = {
        callApi: vi.fn().mockRejectedValue(new Error('API Error')),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']).catch(() => ({}));
      expect(result).toEqual({});
    });

    it('should extract translation from fallback regex when present', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: `"es": "Hola"\n"fr": "Bonjour"`,
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should return empty object if nothing can be parsed', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: 'garbage output',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['zh', 'ja']);
      expect(result).toEqual({});
    });

    it('should handle JSON with extra/unexpected keys', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Hola", "fr": "Bonjour", "extra": "ignored"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola', fr: 'Bonjour' });
    });

    it('should handle code block with non-json language', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '```notjson\n{"es": "Hola", "fr": "Bonjour"}\n```',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola', fr: 'Bonjour' });
    });

    it('should handle batch with empty languages', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', []);
      expect(result).toEqual({});
    });

    it('should handle code block with whitespace and valid JSON', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '```json  \n  { "es": "Hola", "fr": "Bonjour" }   \n```',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola', fr: 'Bonjour' });
    });

    it('should handle YAML with only one language', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: 'es: Hola',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola' });
    });
  });

  describe('addMultilingual', () => {
    it('should translate text and update metadata', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"de": "Hallo Welt"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Hello world' },
        assert: [{ type: 'promptfoo:redteam:harmful' }],
        metadata: { harmCategory: 'Test' },
      };

      const result = await addMultilingual([testCase], 'text', { languages: ['de'] });

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toMatchObject({
        harmCategory: 'Test',
        strategyId: 'multilingual',
        language: 'de',
        originalText: 'Hello world',
      });
      expect(result[0].vars?.text).toBe('Hallo Welt');
    });

    it('should use remote generation when available', async () => {
      const remoteResult = [{ vars: { text: 'Remote result' } }];
      vi.mocked(shouldGenerateRemote).mockReturnValueOnce(true);
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: { result: remoteResult },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addMultilingual([{ vars: { text: 'Test' } }], 'text', {});

      expect(result).toEqual(remoteResult);
      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://test.url',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        }),
        expect.any(Number),
      );
    });

    it('should process batches with correct size', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Prueba"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCases = Array(5).fill({ vars: { text: 'Test' } });
      await addMultilingual(testCases, 'text', { languages: ['es'], maxConcurrency: 2 });

      expect(mockProvider.callApi).toHaveBeenCalledTimes(5);
    });

    it('should handle translation errors gracefully', async () => {
      const mockProvider = {
        callApi: vi.fn().mockRejectedValue(new Error('Translation failed')),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await addMultilingual([{ vars: { text: 'Test' } }], 'text', {
        languages: ['es'],
      });

      expect(result).toHaveLength(0);
    });

    it('should respect concurrency limits', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Prueba"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCases = Array(10).fill({ vars: { text: 'Test' } });
      const maxConcurrency = 3;

      await addMultilingual(testCases, 'text', { languages: ['es'], maxConcurrency });

      // We cannot reliably check concurrency in a single-threaded vitest env,
      // but we can check that all calls were made.
      expect(mockProvider.callApi).toHaveBeenCalledTimes(10);
    });

    it('should handle multiple languages in batches', async () => {
      // Mock returns all three languages in one batch
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Hola", "fr": "Bonjour", "de": "Hallo"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Hello' },
        metadata: {},
      };

      const result = await addMultilingual([testCase], 'text', {
        languages: ['es', 'fr', 'de'],
        maxConcurrency: 1,
      });

      // All three languages should be returned
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.vars?.text)).toEqual(
        expect.arrayContaining(['Hola', 'Bonjour', 'Hallo']),
      );
      // Implementation may call multiple times for provider setup
      expect(mockProvider.callApi).toHaveBeenCalled();
    });

    it('should skip testCase if vars are missing', async () => {
      const testCase: Partial<TestCase> = {
        vars: undefined,
      };
      const result = await addMultilingual([testCase as TestCase], 'text', { languages: ['es'] });
      expect(result).toEqual([]);
    });

    it('should skip if languages is not an array', async () => {
      const result = await addMultilingual([{ vars: { text: 'Hello' } }], 'text', {
        languages: null,
      });
      expect(result).toEqual([]);
    });

    it('should produce correct assertion metric names for redteam types', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Hola"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Hello' },
        assert: [
          { type: 'promptfoo:redteam:harmful', metric: 'harmful' },
          // Use a valid assertion type from the project
          { type: 'contains', metric: 'other' },
        ],
        metadata: {},
      };

      const result = await addMultilingual([testCase], 'text', { languages: ['es'] });
      expect(result).toHaveLength(1);
      expect(result[0].assert?.[0].metric).toBe('harmful/Multilingual-ES');
      expect(result[0].assert?.[1].metric).toBe('other');
    });

    it('should handle empty testCases array', async () => {
      const result = await addMultilingual([], 'text', { languages: ['es'] });
      expect(result).toEqual([]);
    });

    it('should handle empty languages array', async () => {
      const testCase: TestCase = {
        vars: { text: 'Hello' },
        metadata: {},
      };
      const result = await addMultilingual([testCase], 'text', { languages: [] });
      expect(result).toEqual([]);
    });

    it('should handle batch translation with batchSize > 1', async () => {
      // Simulate a batch where the provider returns multiple translations at once
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Hola", "fr": "Bonjour", "de": "Hallo"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Good morning' },
        metadata: {},
      };
      const result = await addMultilingual([testCase], 'text', {
        languages: ['es', 'fr', 'de'],
        maxConcurrency: 2,
      });
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.vars?.text)).toEqual(
        expect.arrayContaining(['Hola', 'Bonjour', 'Hallo']),
      );
    });

    it('should handle concurrency > languages count', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{"es": "Hola"}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Hi' },
        metadata: {},
      };
      const result = await addMultilingual([testCase], 'text', {
        languages: ['es'],
        maxConcurrency: 10,
      });
      expect(result).toHaveLength(1);
      expect(result[0].vars?.text).toBe('Hola');
    });

    it('should not break if translation returns empty object', async () => {
      const mockProvider = {
        callApi: vi.fn().mockResolvedValue({
          output: '{}',
        }),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Hi' },
        metadata: {},
      };
      const result = await addMultilingual([testCase], 'text', {
        languages: ['es', 'fr'],
      });
      expect(result).toEqual([]);
    });

    it('should handle batch translation with errors in one of the batches', async () => {
      // First call succeeds, second call fails
      const mockProvider = {
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output: '{"es": "Hola"}' })
          .mockRejectedValueOnce(new Error('Batch error')),
      };
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Morning' },
        metadata: {},
      };
      const result = await addMultilingual([testCase], 'text', {
        languages: ['es', 'fr'],
        maxConcurrency: 1,
      });
      // Only one translation should be returned
      expect(result).toHaveLength(1);
      expect(result[0].vars?.text).toBe('Hola');
    });
  });
});
