import AdvNoiseProvider, {
  addTypos,
  addSynonymSwaps,
  addPunctuationJitter,
  applyNoise,
  calculateSimilarity,
} from '../../../src/redteam/providers/advNoise';
import type { ApiProvider, CallApiContextParams } from '../../../src/types/providers';

describe('AdvNoiseProvider', () => {
  describe('addTypos', () => {
    it('should add typos to text based on typo rate', () => {
      const text = 'hello world';
      const result = addTypos(text, 0.5);
      expect(result).not.toBe(text);
      expect(result.length).toBeGreaterThanOrEqual(text.length - 1);
    });

    it('should handle empty string', () => {
      const result = addTypos('', 0.1);
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('should make at least one typo even with low rate', () => {
      const text = 'test';
      const result = addTypos(text, 0.01);
      expect(result).not.toBe(text);
    });
  });

  describe('addSynonymSwaps', () => {
    it('should swap words with synonyms', () => {
      const text = 'good bad big small';
      const result = addSynonymSwaps(text, 1.0);
      expect(result).not.toBe(text);
      expect(result.split(' ')).toHaveLength(4);
    });

    it('should handle text without synonyms', () => {
      const text = 'xyz abc';
      expect(addSynonymSwaps(text)).toBe(text);
    });

    it('should handle empty string', () => {
      expect(addSynonymSwaps('')).toBe('');
    });
  });

  describe('addPunctuationJitter', () => {
    it('should modify punctuation', () => {
      const text = 'hello, world!';
      const result = addPunctuationJitter(text, 1.0);
      expect(result).not.toBe(text);
    });

    it('should handle text without punctuation', () => {
      const text = 'hello world';
      const result = addPunctuationJitter(text, 0.5);
      expect(result.length).toBeGreaterThanOrEqual(text.length);
    });

    it('should handle empty string', () => {
      expect(addPunctuationJitter('')).toBe('');
    });
  });

  describe('applyNoise', () => {
    it('should apply all noise transformations', () => {
      const text = 'good morning, world!';
      const result = applyNoise(text, 0.2, 0.2, 0.2);
      expect(result).not.toBe(text);
    });

    it('should not modify text when rates are 0', () => {
      const text = 'hello world';
      expect(applyNoise(text, 0, 0, 0)).toBe(text);
    });

    it('should handle empty string', () => {
      const result = applyNoise('', 0.1, 0.1, 0.1);
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical texts', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1.0);
    });

    it('should return 1.0 for empty strings', () => {
      expect(calculateSimilarity('', '')).toBe(1.0);
    });

    it('should return lower similarity for different texts', () => {
      expect(calculateSimilarity('hello', 'helo')).toBeLessThan(1.0);
    });

    it('should handle completely different texts', () => {
      expect(calculateSimilarity('hello', 'world')).toBeLessThan(0.5);
    });
  });

  describe('AdvNoiseProvider class', () => {
    let mockProvider: ApiProvider;

    beforeEach(() => {
      mockProvider = {
        id: () => 'mock',
        callApi: jest.fn().mockResolvedValue({ output: 'test response' }),
      };
    });

    it('should initialize with default values', () => {
      const provider = new AdvNoiseProvider({ injectVar: 'test' });
      expect(provider.id()).toBe('promptfoo:redteam:adv-noise');
    });

    it('should throw error when injectVar is not provided', () => {
      expect(() => new AdvNoiseProvider({})).toThrow('Expected injectVar to be set');
    });

    it('should return error when no target provider available', async () => {
      const provider = new AdvNoiseProvider({ injectVar: 'test' });
      const result = await provider.callApi('test');
      expect(result.error).toBe('No target provider available for adv-noise strategy');
    });

    it('should process successful response', async () => {
      const provider = new AdvNoiseProvider({
        injectVar: 'test',
        levenshteinThreshold: 0.3,
        maxAttempts: 3,
      });
      const context: CallApiContextParams = {
        originalProvider: mockProvider,
        vars: { test: 'input text' },
        prompt: { raw: 'test prompt', label: 'test prompt' },
      };

      const result = await provider.callApi('test prompt', context);
      expect(result.metadata?.advNoise).toBeDefined();
      expect(result.metadata?.advNoise.threshold).toBe(0.3);
      expect(result.metadata?.advNoise.attempts).toBe(3);
    });

    it('should handle non-string outputs', async () => {
      jest
        .spyOn(mockProvider, 'callApi')
        .mockImplementation()
        .mockResolvedValue({ output: { foo: 'bar' } });
      const provider = new AdvNoiseProvider({ injectVar: 'test' });
      const context = {
        originalProvider: mockProvider,
        vars: { test: 'input' },
        prompt: { raw: 'test', label: 'test' },
      };

      const result = await provider.callApi('test', context);
      expect(result.output).toEqual({ foo: 'bar' });
    });

    it('should handle provider errors', async () => {
      jest
        .spyOn(mockProvider, 'callApi')
        .mockImplementation()
        .mockResolvedValue({ error: 'test error' });
      const provider = new AdvNoiseProvider({ injectVar: 'test' });
      const context = {
        originalProvider: mockProvider,
        vars: { test: 'input' },
        prompt: { raw: 'test', label: 'test' },
      };

      const result = await provider.callApi('test', context);
      expect(result.error).toBe('test error');
    });

    it('should handle non-string input variables', async () => {
      const provider = new AdvNoiseProvider({ injectVar: 'test' });
      const context = {
        originalProvider: mockProvider,
        vars: { test: 'test input' } as Record<string, string | object>,
        prompt: { raw: 'test', label: 'test' },
      };

      const result = await provider.callApi('test', context);
      expect(result.output).toBe('test response');
    });
  });
});
