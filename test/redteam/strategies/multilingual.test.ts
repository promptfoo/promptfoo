import { fetchWithCache } from '../../../src/cache';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import {
  addMultilingual,
  getConcurrencyLimit,
  translateBatch,
} from '../../../src/redteam/strategies/multilingual';
import type { TestCase } from '../../../src/types';

jest.mock('cli-progress', () => ({
  Presets: { shades_classic: {} },
  SingleBar: jest.fn(() => ({
    start: jest.fn(),
    increment: jest.fn(),
    stop: jest.fn(),
    update: jest.fn(),
  })),
}));

jest.mock('../../../src/logger', () => ({
  level: 'info',
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test.url'),
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn().mockResolvedValue({
    data: { result: [] },
    cached: false,
    status: 200,
    statusText: 'OK',
  }),
}));

jest.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getMultilingualProvider: jest.fn().mockResolvedValue(undefined),
    getProvider: jest.fn().mockResolvedValue({
      callApi: jest.fn().mockResolvedValue({
        output: '{"de": "Hallo Welt"}',
      }),
      config: {},
      isAvailable: jest.fn().mockResolvedValue(true),
    }),
  },
}));

describe('Multilingual Strategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('translateBatch', () => {
    it('prefers multilingual provider when available', async () => {
      const multilingualProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Hola"}',
        }),
      };
      jest
        .mocked(redteamProviderManager.getMultilingualProvider)
        .mockResolvedValueOnce(multilingualProvider as any);

      const result = await translateBatch('Hello', ['es']);

      expect(result).toEqual({ es: 'Hola' });
      expect(jest.mocked(redteamProviderManager.getProvider)).not.toHaveBeenCalled();
      expect(multilingualProvider.callApi).toHaveBeenCalled();
    });

    it('falls back to regular provider when multilingual provider is unavailable', async () => {
      jest
        .mocked(redteamProviderManager.getMultilingualProvider)
        .mockResolvedValueOnce(undefined as any);

      const provider = {
        callApi: jest.fn().mockResolvedValue({ output: '{"fr": "Bonjour"}' }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValueOnce(provider as any);

      const result = await translateBatch('Hello', ['fr']);

      expect(result).toEqual({ fr: 'Bonjour' });
      expect(jest.mocked(redteamProviderManager.getProvider)).toHaveBeenCalled();
      expect(provider.callApi).toHaveBeenCalled();
    });
    it('should handle JSON response format', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Hola", "fr": "Bonjour"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should handle code block response format', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '```json\n{"es": "Hola", "fr": "Bonjour"}\n```',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should handle YAML response format', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: 'es: Hola\nfr: Bonjour',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should handle partial translations', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Hola"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
      });
    });

    it('should handle invalid response format', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: 'invalid response',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({});
    });

    it('should handle API errors gracefully', async () => {
      const mockProvider = {
        callApi: jest.fn().mockRejectedValue(new Error('API Error')),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({});
    });

    it('should extract translation from fallback regex when present', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: `"es": "Hola"\n"fr": "Bonjour"`,
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should return empty object if nothing can be parsed', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: 'garbage output',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['zh', 'ja']);
      expect(result).toEqual({});
    });

    it('should handle JSON with extra/unexpected keys', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Hola", "fr": "Bonjour", "extra": "ignored"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola', fr: 'Bonjour' });
    });

    it('should handle code block with non-json language', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '```notjson\n{"es": "Hola", "fr": "Bonjour"}\n```',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola', fr: 'Bonjour' });
    });

    it('should handle batch with empty languages', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '{}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', []);
      expect(result).toEqual({});
    });

    it('should handle code block with whitespace and valid JSON', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '```json  \n  { "es": "Hola", "fr": "Bonjour" }   \n```',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola', fr: 'Bonjour' });
    });

    it('should handle YAML with only one language', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: 'es: Hola',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);
      const result = await translateBatch('Hello', ['es', 'fr']);
      expect(result).toEqual({ es: 'Hola' });
    });
  });

  describe('addMultilingual', () => {
    it('should translate text and update metadata', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '{"de": "Hallo Welt"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

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
      jest.mocked(shouldGenerateRemote).mockReturnValueOnce(true);
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
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
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Prueba"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCases = Array(5).fill({ vars: { text: 'Test' } });
      await addMultilingual(testCases, 'text', { languages: ['es'], maxConcurrency: 2 });

      expect(mockProvider.callApi).toHaveBeenCalledTimes(5);
    });

    it('should handle translation errors gracefully', async () => {
      const mockProvider = {
        callApi: jest.fn().mockRejectedValue(new Error('Translation failed')),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await addMultilingual([{ vars: { text: 'Test' } }], 'text', {
        languages: ['es'],
      });

      expect(result).toHaveLength(0);
    });

    it('should respect concurrency limits', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Prueba"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCases = Array(10).fill({ vars: { text: 'Test' } });
      const maxConcurrency = 3;

      await addMultilingual(testCases, 'text', { languages: ['es'], maxConcurrency });

      // We cannot reliably check concurrency in a single-threaded jest env,
      // but we can check that all calls were made.
      expect(mockProvider.callApi).toHaveBeenCalledTimes(10);
    });

    it('should handle multiple languages in batches', async () => {
      // With adaptive batching: first batch (es, fr) succeeds with partial result,
      // then fallback tries individual de
      const mockProvider = {
        callApi: jest
          .fn()
          .mockResolvedValueOnce({ output: '{"es": "Hola", "fr": "Bonjour"}' }) // First batch succeeds
          .mockResolvedValueOnce({ output: '{"de": "Hallo"}' }), // Individual fallback for de
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCase: TestCase = {
        vars: { text: 'Hello' },
        metadata: {},
      };

      const result = await addMultilingual([testCase], 'text', {
        languages: ['es', 'fr', 'de'],
        batchSize: 2, // Set explicit batch size of 2
        maxConcurrency: 1,
      });

      // Should get all 3 languages: first batch (es, fr) + individual fallback (de)
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.vars?.text)).toEqual(
        expect.arrayContaining(['Hola', 'Bonjour', 'Hallo']),
      );
      expect(mockProvider.callApi).toHaveBeenCalledTimes(2); // One batch call + one individual call
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
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Hola"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

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
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Hola", "fr": "Bonjour", "de": "Hallo"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

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
        callApi: jest.fn().mockResolvedValue({
          output: '{"es": "Hola"}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

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
        callApi: jest.fn().mockResolvedValue({
          output: '{}',
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

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
        callApi: jest
          .fn()
          .mockResolvedValueOnce({ output: '{"es": "Hola"}' })
          .mockRejectedValueOnce(new Error('Batch error')),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

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

    describe('getConcurrencyLimit', () => {
      it('should return default concurrency when no config provided', () => {
        expect(getConcurrencyLimit()).toBe(4);
      });

      it('should return configured concurrency limit', () => {
        expect(getConcurrencyLimit({ maxConcurrency: 8 })).toBe(8);
      });

      it('should handle invalid concurrency values', () => {
        expect(getConcurrencyLimit({ maxConcurrency: undefined })).toBe(4);
        expect(getConcurrencyLimit({ maxConcurrency: 0 })).toBe(4);
        expect(getConcurrencyLimit({ maxConcurrency: null })).toBe(4);
        expect(getConcurrencyLimit({ maxConcurrency: -1 })).toBe(4);
        expect(getConcurrencyLimit({ maxConcurrency: 'invalid' })).toBe(4);
      });

      it('should handle valid concurrency values', () => {
        expect(getConcurrencyLimit({ maxConcurrency: 1 })).toBe(1);
        expect(getConcurrencyLimit({ maxConcurrency: 10 })).toBe(10);
        expect(getConcurrencyLimit({ maxConcurrency: '5' })).toBe(5);
      });
    });

    it('should handle partial local translation results', async () => {
      // Mock provider to return partial translations (missing one language)
      const mockProvider = {
        callApi: jest
          .fn()
          .mockResolvedValueOnce({ output: '{"es": "Hola"}' }) // Missing 'fr'
          .mockResolvedValueOnce({ output: '{"fr": "Bonjour"}' }), // Individual retry
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['es', 'fr'], 2);

      expect(result).toEqual({ es: 'Hola', fr: 'Bonjour' });
      expect(mockProvider.callApi).toHaveBeenCalledTimes(2); // Batch + individual retry
    });

    it('should escape language codes in regex fallback', async () => {
      const mockProvider = {
        callApi: jest.fn().mockResolvedValue({
          output: '"zh-CN": "你好", "en-US": "Hello"', // Raw text with special chars
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const result = await translateBatch('Hello', ['zh-CN', 'en-US']);

      expect(result).toEqual({ 'zh-CN': '你好', 'en-US': 'Hello' });
    });

    it('should handle local partial fallback and deduplication', async () => {
      // Test the deduplication logic by simulating partial results that would come from
      // remote generation fallback. Since the remote path is complex to mock properly,
      // we'll test the core deduplication logic that ensures no duplicate test cases
      // are returned when retries occur.

      // Mock provider that simulates what would happen in remote generation:
      // 1. Initial batch returns some results
      // 2. Individual retries fill in missing results
      // 3. Later retries might return duplicates that should be filtered
      const mockProvider = {
        callApi: jest
          .fn()
          // Simulate local fallback after remote fails - partial translation
          .mockResolvedValueOnce({ output: '{"es": "Hola"}' }) // Missing 'fr'
          // Individual retry for missing language
          .mockResolvedValueOnce({ output: '{"fr": "Bonjour"}' })
          // Potential duplicate retry (should not create duplicate test cases)
          .mockResolvedValueOnce({ output: '{"es": "Hola alternative"}' }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCases: TestCase[] = [{ vars: { prompt: 'Hello' }, metadata: {} }];

      const result = await addMultilingual(testCases, 'prompt', {
        languages: ['es', 'fr'],
        batchSize: 1, // Small batch to trigger retry logic
        maxConcurrency: 1,
      });

      // Should have exactly 2 results (one per language), not duplicates
      expect(result).toHaveLength(2);

      // Should have both languages
      const resultLanguages = result.map((r) => r.metadata?.language);
      expect(resultLanguages).toEqual(expect.arrayContaining(['es', 'fr']));

      // Verify the translations are the expected ones (first occurrence wins)
      const spanishTest = result.find((r) => r.metadata?.language === 'es');
      const frenchTest = result.find((r) => r.metadata?.language === 'fr');

      expect(spanishTest?.vars?.prompt).toBe('Hola');
      expect(frenchTest?.vars?.prompt).toBe('Bonjour');
    });

    it('should handle improved missing detection logic', async () => {
      // Test the improved missing detection logic indirectly through local generation
      // This validates that the deduplication key logic improvements work correctly
      // when originalText metadata is properly preserved vs when it's missing

      let callCount = 0;
      const mockProvider = {
        callApi: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call: partial success with proper originalText metadata
            return Promise.resolve({
              output: JSON.stringify({
                es: 'Hola mundo',
                // Missing French, will trigger individual retry
              }),
            });
          } else if (callCount === 2) {
            // Second call: individual retry for missing language
            return Promise.resolve({
              output: JSON.stringify({
                fr: 'Bonjour le monde',
              }),
            });
          } else {
            // Should not have additional calls for this scenario
            return Promise.resolve({ output: '{}' });
          }
        }),
      };
      jest.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider as any);

      const testCases: TestCase[] = [{ vars: { prompt: 'Hello world' }, metadata: {} }];

      const result = await addMultilingual(testCases, 'prompt', {
        languages: ['es', 'fr'],
        batchSize: 1, // Small batch size to trigger retry logic
        maxConcurrency: 1,
      });

      // Should have exactly 2 results (one per language)
      expect(result).toHaveLength(2);

      // Verify both languages are present and correct
      const resultLanguages = result.map((r) => r.metadata?.language);
      expect(resultLanguages).toEqual(expect.arrayContaining(['es', 'fr']));

      const spanishResult = result.find((r) => r.metadata?.language === 'es');
      const frenchResult = result.find((r) => r.metadata?.language === 'fr');

      expect(spanishResult?.vars?.prompt).toBe('Hola mundo');
      expect(frenchResult?.vars?.prompt).toBe('Bonjour le monde');

      // Should have made exactly 2 API calls:
      // 1. Initial batch call (partial success)
      // 2. Individual retry for missing language
      expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
    });
  });
});
