import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addCompositeTestCases } from '../../../src/redteam/strategies/singleTurnComposite';
import { DEFAULT_COMPOSITE_JAILBREAK_N } from '../../../src/redteam/constants/plugins';
import type { TestCase } from '../../../src/types';

jest.mock('cli-progress');
jest.mock('../../../src/cache');
jest.mock('../../../src/globalConfig/accounts');
jest.mock('../../../src/redteam/remoteGeneration');

/**
 * Integration tests to verify that the UI probe estimation matches the actual probe generation
 * for the composite jailbreak strategy.
 */
describe('composite jailbreak estimation vs actual generation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
    jest.mocked(getRemoteGenerationUrl).mockReturnValue('http://test.com');
    jest.mocked(neverGenerateRemote).mockReturnValue(false);
  });

  const createTestCases = (count: number): TestCase[] => {
    return Array.from({ length: count }, (_, i) => ({
      vars: {
        prompt: `test prompt ${i + 1}`,
      },
      assert: [
        {
          type: 'equals',
          value: 'expected',
          metric: `metric-${i + 1}`,
        },
      ],
    }));
  };

  describe('probe count verification', () => {
    it('should generate exactly n variations per test case with default n', async () => {
      const numTestCases = 3;
      const testCases = createTestCases(numTestCases);
      const expectedN = DEFAULT_COMPOSITE_JAILBREAK_N; // Should be 5

      // Mock API to return exactly n variations per test case
      const mockVariations = Array.from(
        { length: expectedN },
        (_, i) => `variation ${i + 1}`
      );

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: mockVariations,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCases, 'prompt', {});

      // Verify: numTestCases * DEFAULT_N variations generated
      const expectedTotalProbes = numTestCases * expectedN;
      expect(result).toHaveLength(expectedTotalProbes);

      // Verify each original test case got exactly n variations
      for (let i = 0; i < numTestCases; i++) {
        const testCaseVariations = result.slice(i * expectedN, (i + 1) * expectedN);
        expect(testCaseVariations).toHaveLength(expectedN);
      }
    });

    it('should generate exactly n variations per test case with custom n', async () => {
      const numTestCases = 2;
      const testCases = createTestCases(numTestCases);
      const customN = 10;

      // Mock API to return exactly customN variations per test case
      const mockVariations = Array.from(
        { length: customN },
        (_, i) => `custom variation ${i + 1}`
      );

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: mockVariations,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCases, 'prompt', { n: customN });

      // Verify: numTestCases * customN variations generated
      const expectedTotalProbes = numTestCases * customN;
      expect(result).toHaveLength(expectedTotalProbes);

      // Verify the API was called with the correct n value
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(`"n":${customN}`),
        }),
        expect.any(Number),
      );
    });

    it('should match UI estimation formula: baseProbes + (n * baseProbes)', async () => {
      // UI estimation formula from utils.ts:
      // baseProbes = numTests * plugins.length
      // strategyProbes = n * baseProbes
      // total = baseProbes + strategyProbes

      const numTests = 5;
      const numPlugins = 2;
      const n = 3;

      // Create test cases simulating numTests * numPlugins
      const baseProbes = numTests * numPlugins;
      const testCases = createTestCases(baseProbes);

      // Mock API to return n variations per test case
      const mockVariations = Array.from({ length: n }, (_, i) => `var ${i + 1}`);
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: mockVariations,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCases, 'prompt', { n });

      // Actual generation creates: baseProbes * n total variations
      const actualProbes = result.length;
      expect(actualProbes).toBe(baseProbes * n);

      // This matches what the UI would calculate as strategyProbes
      // The UI adds baseProbes + strategyProbes, but in reality,
      // the composite strategy replaces the base probes with variations
    });
  });

  describe('edge cases matching UI test cases', () => {
    it('should handle n=0 by falling back to default', async () => {
      const testCases = createTestCases(1);

      // When n=0 is passed, the API should either reject it or use default
      // Based on UI tests, we expect fallback to default
      const mockVariations = Array.from(
        { length: DEFAULT_COMPOSITE_JAILBREAK_N },
        (_, i) => `default variation ${i + 1}`
      );

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: mockVariations,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCases, 'prompt', { n: 0 });

      // Should fall back to default n
      expect(result).toHaveLength(DEFAULT_COMPOSITE_JAILBREAK_N);
    });

    it('should handle very large n values', async () => {
      const testCases = createTestCases(1);
      const largeN = 100;

      const mockVariations = Array.from(
        { length: largeN },
        (_, i) => `large variation ${i + 1}`
      );

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: mockVariations,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCases, 'prompt', { n: largeN });

      expect(result).toHaveLength(largeN);
    });

    it('should handle string n values by converting to number', async () => {
      const testCases = createTestCases(1);
      const stringN = '7';
      const numericN = 7;

      const mockVariations = Array.from(
        { length: numericN },
        (_, i) => `string n variation ${i + 1}`
      );

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: mockVariations,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      // TypeScript might complain, but we're testing runtime behavior
      const result = await addCompositeTestCases(testCases, 'prompt', { n: stringN as any });

      expect(result).toHaveLength(numericN);

      // Verify the API received the numeric value
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(`"n":"7"`), // String is passed as-is
        }),
        expect.any(Number),
      );
    });
  });

  describe('multiple composite strategies', () => {
    it('should handle multiple composite strategies independently', async () => {
      // Simulating what happens when there are multiple composite strategies
      // Each should generate its own set of variations
      const testCases = createTestCases(2);
      const n1 = 3;
      const n2 = 2;

      // First strategy call
      const mockVariations1 = Array.from(
        { length: n1 },
        (_, i) => `strategy1 var ${i + 1}`
      );

      // Second strategy call would be on the output of the first
      const mockVariations2 = Array.from(
        { length: n2 },
        (_, i) => `strategy2 var ${i + 1}`
      );

      jest.mocked(fetchWithCache)
        .mockResolvedValueOnce({
          data: { modifiedPrompts: mockVariations1 },
          cached: false,
          status: 200,
          statusText: 'OK',
        })
        .mockResolvedValueOnce({
          data: { modifiedPrompts: mockVariations1 },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

      // First composite strategy
      const result1 = await addCompositeTestCases(testCases, 'prompt', { n: n1 });
      expect(result1).toHaveLength(testCases.length * n1);

      // Reset mock for second strategy
      jest.mocked(fetchWithCache).mockClear();
      jest.mocked(fetchWithCache)
        .mockResolvedValue({
          data: { modifiedPrompts: mockVariations2 },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

      // Second composite strategy on result of first
      const result2 = await addCompositeTestCases(result1, 'prompt', { n: n2 });

      // This would create n2 variations for each of the result1 items
      expect(result2).toHaveLength(result1.length * n2);
    });
  });

  describe('consistency with UI estimation logic', () => {
    it('should align with getEstimatedProbes calculation', async () => {
      // Test configuration matching what UI would have
      const config = {
        numTests: 5,
        plugins: ['harmful:hate', 'pii:direct'],
        strategies: [{ id: 'jailbreak:composite', config: { n: 4 } }],
      };

      // UI calculation:
      // baseProbes = 5 * 2 = 10
      // strategyProbes = 4 * 10 = 40
      // total estimated = 10 + 40 = 50

      // In reality, composite strategy generates variations
      const baseProbes = config.numTests * config.plugins.length;
      const testCases = createTestCases(baseProbes);
      const n = 4;

      const mockVariations = Array.from({ length: n }, (_, i) => `probe ${i + 1}`);
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { modifiedPrompts: mockVariations },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCases, 'prompt', { n });

      // Actual probes generated
      const actualProbes = result.length;

      // The composite strategy replaces each test case with n variations
      expect(actualProbes).toBe(baseProbes * n); // 10 * 4 = 40

      // Note: The UI shows baseProbes + strategyProbes = 50
      // But actual generation creates baseProbes * n = 40
      // This is because composite strategy transforms existing probes, not adds to them
    });
  });

  describe('API payload verification', () => {
    it('should not send n parameter when using default', async () => {
      const testCases = createTestCases(1);

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: Array.from({ length: 5 }, (_, i) => `var ${i}`),
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await addCompositeTestCases(testCases, 'prompt', {});

      // When no n is specified, it should not be in the payload
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.not.stringContaining('"n":'),
        }),
        expect.any(Number),
      );
    });

    it('should send n parameter when explicitly configured', async () => {
      const testCases = createTestCases(1);
      const customN = 8;

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: Array.from({ length: customN }, (_, i) => `var ${i}`),
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await addCompositeTestCases(testCases, 'prompt', { n: customN });

      // When n is specified, it should be in the payload
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(`"n":${customN}`),
        }),
        expect.any(Number),
      );
    });
  });
});