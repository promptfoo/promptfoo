import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

const createUnrelatedTextParams = () => ({
  assertion: { type: 'meteor', value: 'The cat sat on the mat' },
  renderedValue: 'The cat sat on the mat',
  outputString: 'The dog ran in the park',
  inverse: false,
});

vi.mock('natural', () => ({
  PorterStemmer: { stem: (word: string) => word.replace(/s$/, '') },
  WordNet: class {
    lookup(word: string, callback: (records: { synonyms: string[] }[]) => void) {
      const synonyms: Record<string, string[]> = {
        cat: ['feline'],
        mat: ['rug'],
        sat: ['sitting'],
      };
      callback([{ synonyms: synonyms[word] || [] }]);
    }
  },
}));

// Prime the lazy dependency once: concurrent imports can bypass Vitest's manual mock.
beforeAll(() => handleMeteorAssertion(createUnrelatedTextParams() as any));

interface MeteorAssertion {
  type: string;
  value?: string | string[];
  threshold?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

interface TestParams {
  assertion: MeteorAssertion;
  renderedValue: string | string[];
  outputString: string;
  inverse: boolean;
}

describe('METEOR score calculation', () => {
  describe('identical sentences', () => {
    it('should have high METEOR score', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor', value: 'The cat sat on the mat' },
        renderedValue: 'The cat sat on the mat',
        outputString: 'The cat sat on the mat',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.95);
    });

    it('should handle period after words', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor', value: 'The cat sat on the mat' },
        renderedValue: 'The cat sat on the mat',
        outputString: 'The cat sat on the mat.',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.95);
    });
  });

  describe('similar sentences', () => {
    it('should handle nltk example', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor' },
        renderedValue:
          'It is a guide to action which ensures that the military always obeys the commands of the party',
        outputString:
          'It is a guide to action that ensures the military will forever heed Party commands',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.6);
    });
  });

  describe('non-matching sentences', () => {
    it('should handle non matching sentences', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor' },
        renderedValue: 'The cat sat on the mat',
        outputString: 'non matching hypothesis',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(false);
      expect(result.score).toBeLessThan(0.5);
    });

    it('should handle completely different sentences', async () => {
      const params: TestParams = createUnrelatedTextParams();

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(false);
      expect(result.score).toBeLessThan(0.5);
    });
  });

  describe('multiple references', () => {
    it('should handle multiple references', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor' },
        renderedValue: [
          'It is a guide to action that ensures that the military will forever heed Party commands',
          'It is the guiding principle which guarantees the military forces always being under the command of the Party',
          'It is the practical guide for the army always to heed the directions of the party',
        ],
        outputString:
          'It is a guide to action which ensures that the military always obeys the commands of the party',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.69);
    });

    it('should handle multiple references and take best matching score', async () => {
      const params: TestParams = {
        assertion: {
          type: 'meteor',
          value: [
            'The cat sat on the mat.',
            'There is a cat on the mat.',
            'A cat is sitting on the mat.',
          ],
        },
        renderedValue: [
          'The cat sat on the mat.',
          'There is a cat on the mat.',
          'A cat is sitting on the mat.',
        ],
        outputString: 'The cat was sitting on the mat.',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });
  });

  describe('parameters and edge cases', () => {
    it('should handle custom parameters', async () => {
      const params: TestParams = {
        assertion: {
          type: 'meteor',
          value: 'The cat sat on the mat',
          threshold: 0.75,
          alpha: 0.85,
          beta: 2.0,
          gamma: 0.4,
        },
        renderedValue: 'The cat sat on the mat',
        outputString: 'The cat is sitting on the mat',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should handle inverse assertion', async () => {
      const params: TestParams = {
        assertion: {
          type: 'meteor',
          value: 'The cat sat on the mat',
          threshold: 0.8,
        },
        renderedValue: 'The cat sat on the mat',
        outputString: 'The dog ran in the park',
        inverse: true,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should throw error for invalid inputs', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor', value: [] },
        renderedValue: [],
        outputString: 'test',
        inverse: false,
      };

      await expect(handleMeteorAssertion(params as any)).rejects.toThrow('Invalid inputs');
    });

    it('should use default threshold of 0.5', async () => {
      const params: TestParams = createUnrelatedTextParams();

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(false);
      expect(result.score).toBeLessThan(0.5);
      expect(result.reason).toMatch(/METEOR score \d+\.\d+ did not meet threshold 0\.5/);
    });

    it('should properly extract parameters from assertion', async () => {
      const params: TestParams = {
        assertion: {
          type: 'meteor',
          value: 'The cat sat on the mat',
          threshold: 0.6,
          alpha: 0.9,
          beta: 3.0,
          gamma: 0.5,
        },
        renderedValue: 'The cat sat on the mat',
        outputString: 'The cat sat on the mat',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.95);
    });
  });

  describe('tokenization and sentence processing', () => {
    it('should handle empty references correctly', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor', value: 'Empty output' },
        renderedValue: [],
        outputString: 'Not empty',
        inverse: false,
      };

      await expect(handleMeteorAssertion(params as any)).rejects.toThrow('Invalid inputs');
    });

    it('should ignore punctuation in string comparison', async () => {
      const params1: TestParams = {
        assertion: { type: 'meteor', value: 'one two three' },
        renderedValue: 'one two three',
        outputString: 'one two three',
        inverse: false,
      };

      const params2: TestParams = {
        assertion: { type: 'meteor', value: 'one, two, three' },
        renderedValue: 'one, two, three',
        outputString: 'one, two, three',
        inverse: false,
      };

      const result1 = await handleMeteorAssertion(params1 as any);
      const result2 = await handleMeteorAssertion(params2 as any);

      expect(result1.score).toBeGreaterThan(0.95);
      expect(result2.score).toBeGreaterThan(0.95);
    });

    it('should handle case insensitivity in matching', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor', value: 'THE CAT SAT ON THE MAT' },
        renderedValue: 'THE CAT SAT ON THE MAT',
        outputString: 'the cat sat on the mat',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.95);
    });
  });

  describe('multiple word forms and stemming', () => {
    it('should handle stemming variations', async () => {
      const params: TestParams = {
        assertion: {
          type: 'meteor',
          value: 'The cats are sitting on the mats',
          threshold: 0.5,
        },
        renderedValue: 'The cats are sitting on the mats',
        outputString: 'The cat is sitting on the mat',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should handle synonyms through the WordNet mock', async () => {
      const params: TestParams = {
        assertion: { type: 'meteor', value: 'The feline sat on the rug' },
        renderedValue: 'The feline sat on the rug',
        outputString: 'The cat sat on the mat',
        inverse: false,
      };

      const result = await handleMeteorAssertion(params as any);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
    });
  });
});
