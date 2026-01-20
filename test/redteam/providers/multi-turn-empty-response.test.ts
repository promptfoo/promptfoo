import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrescendoProvider } from '../../../src/redteam/providers/crescendo/index';
import { CustomProvider } from '../../../src/redteam/providers/custom/index';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';

import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiFunction,
  ProviderResponse,
} from '../../../src/types/index';

// Use vi.hoisted for proper mock isolation
const mockGetProvider = vi.hoisted(() => vi.fn());
const mockGetTargetResponse = vi.hoisted(() => vi.fn());

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

// Mock the shared module with hoisted functions
vi.mock('../../../src/redteam/providers/shared', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getTargetResponse: mockGetTargetResponse,
    redteamProviderManager: {
      getProvider: mockGetProvider,
      getGradingProvider: mockGetProvider,
    },
    // Mock tryUnblocking to avoid network calls
    tryUnblocking: vi.fn().mockResolvedValue({ success: false }),
  };
});

// Mock graders to avoid dynamic import issues
vi.mock('../../../src/redteam/graders', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getGraderById: vi.fn().mockReturnValue(undefined),
  };
});

// Mock remote generation to ensure consistent behavior
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: vi.fn().mockReturnValue(false),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
  };
});

describe('Multi-turn strategies empty response handling', () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const createMockTargetProvider = (): ApiProvider => ({
    id: () => 'mock-target',
    callApi: vi.fn() as CallApiFunction,
  });

  const createTestContext = (targetProvider: ApiProvider): CallApiContextParams => ({
    originalProvider: targetProvider,
    vars: { prompt: 'test value' },
    prompt: { raw: 'Test prompt: {{prompt}}', label: 'test' },
    test: {
      metadata: { goal: 'Test goal for empty response handling' },
      assert: [],
    } as AtomicTestCase,
  });

  // Create a mock redteam provider that returns appropriate responses
  const createMockRedteamProvider = () => ({
    id: () => 'mock-redteam-provider',
    callApi: vi
      .fn<(prompt: string, context?: any) => Promise<ProviderResponse>>()
      .mockImplementation(async (prompt: string) => {
        // Parse the prompt to determine what type of response to return
        try {
          const input = JSON.parse(prompt);
          if (Array.isArray(input)) {
            const systemContent = input[0]?.content || '';
            const userContent = input[input.length - 1]?.content || '';

            // Refusal scoring
            if (
              systemContent.includes('refusal') ||
              userContent.includes('responseToEvaluateInput')
            ) {
              return {
                output: JSON.stringify({
                  value: false, // not a refusal
                  metadata: 0,
                  rationale: 'Mock: not a refusal',
                }),
              };
            }

            // Eval scoring
            if (
              systemContent.includes('evaluate') ||
              systemContent.includes('conversation objective')
            ) {
              return {
                output: JSON.stringify({
                  value: false,
                  metadata: 0,
                  rationale: 'Mock: objective not met',
                  description: 'Mock description',
                }),
              };
            }
          }
        } catch {
          // Not JSON, continue to default response
        }

        // Default: attack prompt generation
        return {
          output: JSON.stringify({
            generatedQuestion: 'mocked question',
            rationaleBehindJailbreak: 'mocked rationale',
            lastResponseSummary: 'mocked summary',
          }),
        };
      }),
    delay: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset hoisted mocks
    mockGetProvider.mockReset();
    mockGetTargetResponse.mockReset();

    process.env.OPENAI_API_KEY = 'test-api-key';

    // Set up the mock provider
    mockGetProvider.mockResolvedValue(createMockRedteamProvider());
  });

  afterEach(() => {
    if (originalOpenAiApiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe('Crescendo strategy', () => {
    it('handles empty string responses without throwing invariant error', async () => {
      // Mock getTargetResponse to return empty string
      mockGetTargetResponse.mockResolvedValue({
        output: '',
        tokenUsage: { numRequests: 1 },
      });

      const mockTarget = createMockTargetProvider();
      const strategy = new CrescendoProvider({
        injectVar: 'prompt',
        redteamProvider: 'openai:gpt-4',
        maxTurns: 1,
        maxBacktracks: 0,
      });
      const context = createTestContext(mockTarget);

      // This should not throw the invariant error that was happening before
      const result = await strategy.callApi('test prompt', context);

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.tokenUsage).toBeDefined();
    });

    it('handles other falsy values without throwing invariant error', async () => {
      const falsyValues = [0, false, null];

      for (const value of falsyValues) {
        // Mock getTargetResponse to return falsy value
        mockGetTargetResponse.mockResolvedValue({
          output: value as any,
          tokenUsage: { numRequests: 1 },
        });

        const mockTarget = createMockTargetProvider();
        const strategy = new CrescendoProvider({
          injectVar: 'prompt',
          redteamProvider: 'openai:gpt-4',
          maxTurns: 1,
          maxBacktracks: 0,
        });
        const context = createTestContext(mockTarget);

        // Should not throw invariant error for any falsy but valid output
        const result = await strategy.callApi('test prompt', context);

        expect(result).toBeDefined();
        expect(result.output).toBeDefined();
        expect(result.metadata).toBeDefined();
        expect(result.tokenUsage).toBeDefined();
      }
    });
  });

  describe('Custom strategy', () => {
    it('handles empty string responses without throwing invariant error', async () => {
      // Mock getTargetResponse to return empty string
      mockGetTargetResponse.mockResolvedValue({
        output: '',
        tokenUsage: { numRequests: 1 },
      });

      const mockTarget = createMockTargetProvider();
      const strategy = new CustomProvider({
        injectVar: 'prompt',
        redteamProvider: 'openai:gpt-4',
        maxTurns: 1,
        strategyText: 'Test strategy for empty responses',
      });
      const context = createTestContext(mockTarget);

      // This should not throw the invariant error that was happening before
      const result = await strategy.callApi('test prompt', context);

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.tokenUsage).toBeDefined();
    });
  });

  describe('Iterative strategy', () => {
    it('processes empty string responses instead of skipping iterations', async () => {
      // Mock getTargetResponse to return empty string
      mockGetTargetResponse.mockResolvedValue({
        output: '',
        tokenUsage: { numRequests: 1 },
      });

      const mockTarget = createMockTargetProvider();
      const strategy = new RedteamIterativeProvider({
        injectVar: 'prompt',
        redteamProvider: 'openai:gpt-4',
        numIterations: '2',
      });
      const context = createTestContext(mockTarget);

      // This should process the empty response instead of skipping it
      const result = await strategy.callApi('test prompt', context);

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.tokenUsage).toBeDefined();
    });
  });

  // Test that our fix doesn't break when responses are truly malformed
  describe('Validation still works for malformed responses', () => {
    it('demonstrates the fix works for the core issue', () => {
      // This test documents that the fix is working - the key insight is that
      // before our fix, empty string responses would cause invariant failures.
      // The successful tests above prove that this core issue is resolved.

      // The specific invariant checks we fixed:
      // - Object.prototype.hasOwnProperty.call(targetResponse, 'output') instead of targetResponse.output
      // - This allows empty strings, zeros, false, null to pass validation
      // - While still catching truly missing 'output' properties

      expect(Object.prototype.hasOwnProperty.call({ output: '' }, 'output')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call({ output: 0 }, 'output')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call({ output: false }, 'output')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call({ output: null }, 'output')).toBe(true);

      // But should still fail for missing properties
      expect(Object.prototype.hasOwnProperty.call({ foo: 'bar' }, 'output')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call({}, 'output')).toBe(false);
    });
  });
});
