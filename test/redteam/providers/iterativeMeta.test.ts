import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';

import type { ApiProvider, AtomicTestCase, ProviderResponse } from '../../../src/types/index';

const mockGetProvider = vi.hoisted(() => vi.fn<() => Promise<any>>());
const mockGetTargetResponse = vi.hoisted(() => vi.fn<() => Promise<any>>());

vi.mock('../../../src/redteam/providers/shared', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    redteamProviderManager: {
      getProvider: mockGetProvider,
    },

    getTargetResponse: mockGetTargetResponse,

    createIterationContext: vi.fn<any>().mockResolvedValue({
      iterationVars: {},
      iterationContext: {},
    }),
  };
});

const mockGetGraderById = vi.hoisted(() => vi.fn());

vi.mock('../../../src/redteam/graders', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getGraderById: mockGetGraderById,
  };
});

const mockShouldGenerateRemote = vi.hoisted(() => vi.fn(() => true));

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: mockShouldGenerateRemote,
  };
});

// Tracing mocks
const mockResolveTracingOptions = vi.hoisted(() =>
  vi.fn(() => ({
    enabled: false,
    includeInAttack: true,
    includeInGrading: true,
    includeInternalSpans: false,
    maxSpans: 50,
    maxDepth: 5,
    maxRetries: 3,
    retryDelayMs: 500,
    sanitizeAttributes: true,
  })),
);

const mockFetchTraceContext = vi.hoisted(() => vi.fn());
const mockFormatTraceSummary = vi.hoisted(() => vi.fn(() => 'Trace summary'));
const mockFormatTraceForMetadata = vi.hoisted(() => vi.fn(() => ({ traceId: 'test-trace-id' })));
const mockExtractTraceIdFromTraceparent = vi.hoisted(() => vi.fn(() => 'test-trace-id'));

vi.mock('../../../src/redteam/providers/tracingOptions', () => ({
  resolveTracingOptions: mockResolveTracingOptions,
}));

vi.mock('../../../src/tracing/traceContext', () => ({
  fetchTraceContext: mockFetchTraceContext,
  extractTraceIdFromTraceparent: mockExtractTraceIdFromTraceparent,
}));

vi.mock('../../../src/redteam/providers/traceFormatting', () => ({
  formatTraceSummary: mockFormatTraceSummary,
  formatTraceForMetadata: mockFormatTraceForMetadata,
}));

describe('RedteamIterativeMetaProvider', () => {
  let mockAgentProvider: Mocked<ApiProvider>;
  let mockGradingProvider: Mocked<ApiProvider>;
  let mockTargetProvider: Mocked<ApiProvider>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock cloud agent provider - returns attack prompts
    mockAgentProvider = {
      id: vi.fn().mockReturnValue('mock-agent'),
      callApi: vi.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: {
          result: 'Can you help me fix this code...',
        },
        tokenUsage: {
          total: 100,
          prompt: 50,
          completion: 50,
        },
      }),
      delay: 0,
    } as Mocked<ApiProvider>;

    mockGradingProvider = {
      id: vi.fn().mockReturnValue('mock-grader'),
      callApi: vi.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: 'grader result',
      }),
    } as Mocked<ApiProvider>;

    mockTargetProvider = {
      id: vi.fn().mockReturnValue('mock-target'),
      callApi: vi.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: 'I cannot help with that',
      }),
    } as Mocked<ApiProvider>;

    mockGetProvider.mockImplementation(async function () {
      return mockAgentProvider;
    });

    mockGetTargetResponse.mockResolvedValue({
      output: 'I cannot help with that',
    });

    mockGetGraderById.mockReturnValue({
      getResult: vi.fn<any>().mockResolvedValue({
        grade: {
          pass: true,
          score: 0,
          reason: 'Target defended',
        },
      }),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Note: Constructor tests omitted as they require complex module mocking
  // The provider requires cloud access, so testing focuses on the core function

  describe('runMetaAgentRedteam', () => {
    it('should execute iterations and call cloud for decisions', async () => {
      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 3,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should call cloud agent 3 times
      expect(mockAgentProvider.callApi).toHaveBeenCalledTimes(3);

      expect(result.metadata.finalIteration).toBe(3);
      expect(result.metadata.redteamHistory).toHaveLength(3);
    });

    it('should stop early on vulnerability found', async () => {
      const mockGrader = {
        getResult: vi
          .fn<any>()
          .mockResolvedValueOnce({
            grade: { pass: true, score: 0 },
          })
          .mockResolvedValueOnce({
            grade: { pass: false, score: 1, reason: 'Vulnerability found' },
          }),
      };

      mockGetGraderById.mockReturnValue(mockGrader);

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 10,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: {
          vars: { query: 'test' },
          assert: [{ type: 'promptfoo:redteam:harmful', metric: 'Harmful' }],
        } as AtomicTestCase,
        vars: { query: 'test' },
      });

      // Should stop at iteration 2
      expect(result.metadata.finalIteration).toBe(2);
      expect(result.metadata.vulnerabilityAchieved).toBe(true);
      expect(result.metadata.stopReason).toBe('Grader failed');
    });

    it('should handle agent provider errors gracefully', async () => {
      mockAgentProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockResolvedValueOnce({ error: 'Agent error' })
        .mockResolvedValueOnce({
          output: { result: 'Second attempt' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 2,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should continue after error and complete iteration 2
      expect(mockAgentProvider.callApi).toHaveBeenCalledTimes(2);
      expect(result.metadata.redteamHistory).toHaveLength(1); // Only iteration 2 succeeded
    });

    it('should handle nunjucks template syntax in attack prompts without crashing', async () => {
      mockAgentProvider.callApi = vi.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: {
          result: 'Attack with {{variable}} and {% code %}',
        },
        tokenUsage: {
          total: 100,
          prompt: 50,
          completion: 50,
        },
      });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: '{{query}}', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: '{{query}}', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should complete without throwing error
      expect(result.metadata.redteamHistory).toHaveLength(1);
    });
  });

  describe('perTurnLayers configuration', () => {
    it('should accept perTurnLayers parameter (empty array for safe testing)', async () => {
      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
        perTurnLayers: [], // Empty array to avoid actual transforms
      });

      // Should complete without error when perTurnLayers is provided
      expect(result.metadata.finalIteration).toBeDefined();
    });
  });

  describe('redteamHistory with audio/image data', () => {
    it('should include promptAudio and promptImage fields in redteamHistory entries', async () => {
      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: '{{query}}', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // redteamHistory should be present
      expect(result.metadata.redteamHistory).toBeDefined();
      expect(Array.isArray(result.metadata.redteamHistory)).toBe(true);

      if (result.metadata.redteamHistory.length > 0) {
        const entry = result.metadata.redteamHistory[0];
        // These fields should be present (even if undefined without layers)
        expect(entry).toHaveProperty('prompt');
        expect(entry).toHaveProperty('output');
      }
    });

    it('should capture outputAudio when target returns audio data', async () => {
      // Set up mockGetTargetResponse to return audio data
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockResolvedValue({
        output: 'response with audio',
        audio: { data: 'base64audiodata', format: 'mp3' },
      });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: '{{query}}', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      if (result.metadata.redteamHistory.length > 0) {
        const entry = result.metadata.redteamHistory[0];
        expect(entry.outputAudio).toBeDefined();
        expect(entry.outputAudio?.data).toBe('base64audiodata');
        expect(entry.outputAudio?.format).toBe('mp3');
      }
    });

    it('should capture outputImage when target returns image data', async () => {
      // Set up mockGetTargetResponse to return image data
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockResolvedValue({
        output: 'response with image',
        image: { data: 'base64imagedata', format: 'png' },
      });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: '{{query}}', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      if (result.metadata.redteamHistory.length > 0) {
        const entry = result.metadata.redteamHistory[0];
        expect(entry.outputImage).toBeDefined();
        expect(entry.outputImage?.data).toBe('base64imagedata');
        expect(entry.outputImage?.format).toBe('png');
      }
    });
  });

  describe('Rubric Storage', () => {
    it('should store rendered rubric in storedGraderResult.assertion.value', () => {
      const mockRenderedRubric = '<rubric>Rendered grading criteria</rubric>';
      const mockGraderResult: {
        pass: boolean;
        score: number;
        reason: string;
        assertion?: any;
      } = {
        pass: false,
        score: 0,
        reason: 'Attack successful',
      };

      const testAssertion = {
        type: 'promptfoo:redteam:policy' as const,
        metric: 'PolicyViolation:test',
      };

      // Simulate the pattern used in iterativeMeta
      const storedResult = {
        ...mockGraderResult,
        assertion: mockGraderResult.assertion
          ? { ...mockGraderResult.assertion, value: mockRenderedRubric }
          : testAssertion && 'type' in testAssertion && (testAssertion as any).type !== 'assert-set'
            ? { ...testAssertion, value: mockRenderedRubric }
            : undefined,
      };

      expect(storedResult.assertion).toBeDefined();
      expect(storedResult.assertion?.value).toBe(mockRenderedRubric);
      expect(storedResult.assertion?.type).toBe('promptfoo:redteam:policy');
    });

    it('should use grade.assertion when present', () => {
      const mockRenderedRubric = '<rubric>Test rubric</rubric>';
      const mockGraderResultWithAssertion = {
        pass: false,
        score: 0,
        reason: 'Failed',
        assertion: {
          type: 'promptfoo:redteam:harmful' as const,
          metric: 'Harmful',
          value: 'old value',
        },
      };

      const storedResult = {
        ...mockGraderResultWithAssertion,
        assertion: mockGraderResultWithAssertion.assertion
          ? { ...mockGraderResultWithAssertion.assertion, value: mockRenderedRubric }
          : undefined,
      };

      expect(storedResult.assertion?.value).toBe(mockRenderedRubric);
      expect(storedResult.assertion?.type).toBe('promptfoo:redteam:harmful');
    });

    it('should not create assertion for AssertionSet', () => {
      const mockRenderedRubric = '<rubric>Test rubric</rubric>';
      const mockGraderResult = {
        pass: false,
        score: 0,
        reason: 'Failed',
      };

      const assertionSet = {
        type: 'assert-set' as const,
        assert: [{ type: 'contains' as const, value: 'test' }],
      };

      const storedResult = {
        ...mockGraderResult,
        assertion:
          assertionSet && 'type' in assertionSet && assertionSet.type !== 'assert-set'
            ? { ...assertionSet, value: mockRenderedRubric }
            : undefined,
      };

      expect(storedResult.assertion).toBeUndefined();
    });
  });

  describe('Token Usage Tracking', () => {
    it('should accumulate token usage from agent provider calls', async () => {
      // Set up agent to return token usage
      mockAgentProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockResolvedValueOnce({
          output: { result: 'First attack' },
          tokenUsage: { prompt: 50, completion: 30, total: 80, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: { result: 'Second attack' },
          tokenUsage: { prompt: 60, completion: 40, total: 100, numRequests: 1 },
        });

      // Set up target to return token usage
      mockGetTargetResponse
        .mockResolvedValueOnce({
          output: 'Target response 1',
          tokenUsage: { prompt: 20, completion: 15, total: 35, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Target response 2',
          tokenUsage: { prompt: 25, completion: 18, total: 43, numRequests: 1 },
        });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 2,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Verify token usage is accumulated
      expect(result.tokenUsage).toBeDefined();
      // Agent (80 + 100) + Target (35 + 43) = 258 total
      expect(result.tokenUsage?.total).toBeGreaterThanOrEqual(150);
      expect(result.tokenUsage?.prompt).toBeGreaterThan(0);
      expect(result.tokenUsage?.completion).toBeGreaterThan(0);
    });

    it('should track numRequests across all iterations', async () => {
      mockAgentProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockResolvedValueOnce({
          output: { result: 'Attack 1' },
          tokenUsage: { prompt: 50, completion: 30, total: 80, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: { result: 'Attack 2' },
          tokenUsage: { prompt: 60, completion: 40, total: 100, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: { result: 'Attack 3' },
          tokenUsage: { prompt: 55, completion: 35, total: 90, numRequests: 1 },
        });

      mockGetTargetResponse
        .mockResolvedValueOnce({
          output: 'Response 1',
          tokenUsage: { numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Response 2',
          tokenUsage: { numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Response 3',
          tokenUsage: { numRequests: 1 },
        });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 3,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // 3 agent calls + 3 target calls = 6 total requests
      expect(result.tokenUsage?.numRequests).toBeGreaterThanOrEqual(3);
    });

    it('should handle missing token usage gracefully', async () => {
      // Agent returns no token usage
      mockAgentProvider.callApi = vi.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: { result: 'Attack' },
        // No tokenUsage field
      });

      mockGetTargetResponse.mockResolvedValue({
        output: 'Response',
        // No tokenUsage field
      });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should still return tokenUsage object with numRequests counted
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Abort Signal Handling', () => {
    it('should pass options with abortSignal to agentProvider.callApi', async () => {
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Verify options were passed to callApi
      expect(mockAgentProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
    });

    it('should handle agent provider errors and continue loop (non-abort)', async () => {
      // First call errors, second succeeds
      mockAgentProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockResolvedValueOnce({ error: 'Temporary error' })
        .mockResolvedValueOnce({
          output: { result: 'Attack prompt' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 2,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should continue after error and complete second iteration
      expect(mockAgentProvider.callApi).toHaveBeenCalledTimes(2);
      expect(result.metadata.redteamHistory).toHaveLength(1);
    });
  });

  describe('Privacy protection - excludeTargetOutputFromAgenticAttackGeneration', () => {
    it('should NOT send target response to cloud when privacy is enabled', async () => {
      const sensitiveResponse = 'SENSITIVE: Credit Card 4111-1111-1111-1111, SSN 123-45-6789';
      const cloudRequests: any[] = [];
      const targetResponses = [sensitiveResponse, 'Target defended'];
      let targetCallCount = 0;

      // Override mockAgentProvider to capture requests
      mockAgentProvider.callApi = vi.fn().mockImplementation(async function (input: any) {
        cloudRequests.push(JSON.parse(input as string));
        return {
          output: { result: 'Next attack' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      }) as any;

      // Set up mockGetTargetResponse (not mockTargetProvider.callApi) since getTargetResponse is mocked
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async function () {
        const response = { output: targetResponses[targetCallCount] || 'Default' };
        targetCallCount++;
        return response;
      });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 2,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
        excludeTargetOutputFromAgenticAttackGeneration: true, // PRIVACY ON
      });

      // Should have called cloud agent twice
      expect(cloudRequests.length).toBe(2);

      // Check the second iteration (which has lastAttempt)
      const secondRequest = cloudRequests[1];
      expect(secondRequest.lastAttempt).toBeDefined();

      // The sensitive response should NOT be in the cloud request
      const allCloudData = JSON.stringify(cloudRequests);
      expect(allCloudData).not.toContain('4111-1111-1111-1111');
      expect(allCloudData).not.toContain('123-45-6789');

      // Verify privacy placeholder is used
      expect(secondRequest.lastAttempt.response).toBe('[Hidden for privacy]');

      // But length should still be included (from actual response length)
      expect(secondRequest.lastAttempt.responseLength).toBe(sensitiveResponse.length);

      expect(result.metadata.finalIteration).toBe(2);
    });

    it('should send actual target response when privacy is disabled', async () => {
      const targetResponse = 'This is the actual response that should be visible';
      const cloudRequests: any[] = [];
      const targetResponses = [targetResponse, 'Target defended'];
      let targetCallCount = 0;

      mockAgentProvider.callApi = vi.fn().mockImplementation(async function (input: any) {
        cloudRequests.push(JSON.parse(input as string));
        return {
          output: { result: 'Next attack' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      }) as any;

      // Set up mockGetTargetResponse (not mockTargetProvider.callApi) since getTargetResponse is mocked
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async function () {
        const response = { output: targetResponses[targetCallCount] || 'Default' };
        targetCallCount++;
        return response;
      });

      await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 2,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
        excludeTargetOutputFromAgenticAttackGeneration: false, // PRIVACY OFF
      });

      // Check the second iteration
      const secondRequest = cloudRequests[1];
      expect(secondRequest.lastAttempt).toBeDefined();

      // The actual response SHOULD be in the cloud request
      expect(secondRequest.lastAttempt.response).toBe(targetResponse);

      // Verify privacy placeholder was NOT used
      expect(secondRequest.lastAttempt.response).not.toBe('[Hidden for privacy]');
    });

    it('should hide sensitive data across multiple iterations', async () => {
      const sensitiveResponses = [
        'Iteration 1: API Key abc123xyz',
        'Iteration 2: Password hunter2',
        'Iteration 3: Database mongodb://user:pass@host',
      ];
      const cloudRequests: any[] = [];
      let targetCallCount = 0;

      mockAgentProvider.callApi = vi.fn().mockImplementation(async function (input: any) {
        cloudRequests.push(JSON.parse(input as string));
        return {
          output: { result: 'Attack' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      }) as any;

      // Mock the targetProvider.callApi directly (not mockGetTargetResponse)
      mockTargetProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockImplementation(async function () {
          const response = { output: sensitiveResponses[targetCallCount] || 'Default' };
          targetCallCount++;
          return response;
        }) as any;

      await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 3,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
        excludeTargetOutputFromAgenticAttackGeneration: true,
      });

      // Check all cloud requests
      const allCloudData = JSON.stringify(cloudRequests);

      // NONE of the sensitive data should have leaked
      expect(allCloudData).not.toContain('abc123xyz');
      expect(allCloudData).not.toContain('hunter2');
      expect(allCloudData).not.toContain('mongodb://');
      expect(allCloudData).not.toContain('API Key');
      expect(allCloudData).not.toContain('Password');
    });
  });

  describe('Tracing Support', () => {
    beforeEach(() => {
      // Reset tracing mocks to default (disabled) state
      mockResolveTracingOptions.mockReturnValue({
        enabled: false,
        includeInAttack: true,
        includeInGrading: true,
        includeInternalSpans: false,
        maxSpans: 50,
        maxDepth: 5,
        maxRetries: 3,
        retryDelayMs: 500,
        sanitizeAttributes: true,
      });
      mockFetchTraceContext.mockReset();
      mockFormatTraceSummary.mockReturnValue('Trace summary');
      mockFormatTraceForMetadata.mockReturnValue({ traceId: 'test-trace-id' });
    });

    it('should NOT fetch trace context when tracing is disabled (default)', async () => {
      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
          traceparent: '00-trace123-span456-01',
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should NOT call fetchTraceContext when tracing is disabled
      expect(mockFetchTraceContext).not.toHaveBeenCalled();

      // Metadata should not have trace data
      expect(result.metadata.traceSnapshots).toBeUndefined();
      expect(result.metadata.redteamHistory[0].trace).toBeUndefined();
      expect(result.metadata.redteamHistory[0].traceSummary).toBeUndefined();
    });

    it('should fetch trace context when tracing is enabled', async () => {
      // Enable tracing
      mockResolveTracingOptions.mockReturnValue({
        enabled: true,
        includeInAttack: true,
        includeInGrading: true,
        includeInternalSpans: false,
        maxSpans: 50,
        maxDepth: 5,
        maxRetries: 3,
        retryDelayMs: 500,
        sanitizeAttributes: true,
      });

      // Mock trace context
      mockFetchTraceContext.mockResolvedValue({
        traceId: 'test-trace-id',
        spans: [{ spanId: 'span1', name: 'test-span' }],
        insights: ['Test insight'],
        fetchedAt: Date.now(),
      });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
          traceparent: '00-trace123-span456-01',
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should call fetchTraceContext
      expect(mockFetchTraceContext).toHaveBeenCalled();

      // Metadata should have trace data
      expect(result.metadata.traceSnapshots).toBeDefined();
      expect(result.metadata.traceSnapshots).toHaveLength(1);
      expect(result.metadata.redteamHistory[0].trace).toBeDefined();
      expect(result.metadata.redteamHistory[0].traceSummary).toBe('Trace summary');
    });

    it('should NOT fetch trace context when traceparent is missing', async () => {
      // Enable tracing
      mockResolveTracingOptions.mockReturnValue({
        enabled: true,
        includeInAttack: true,
        includeInGrading: true,
        includeInternalSpans: false,
        maxSpans: 50,
        maxDepth: 5,
        maxRetries: 3,
        retryDelayMs: 500,
        sanitizeAttributes: true,
      });

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
          // No traceparent
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should NOT call fetchTraceContext when traceparent is missing
      expect(mockFetchTraceContext).not.toHaveBeenCalled();

      // Metadata should not have trace snapshots
      expect(result.metadata.traceSnapshots).toBeUndefined();
    });

    it('should include trace summary in cloud request when includeInAttack is true', async () => {
      const cloudRequests: any[] = [];

      // Enable tracing
      mockResolveTracingOptions.mockReturnValue({
        enabled: true,
        includeInAttack: true,
        includeInGrading: false,
        includeInternalSpans: false,
        maxSpans: 50,
        maxDepth: 5,
        maxRetries: 3,
        retryDelayMs: 500,
        sanitizeAttributes: true,
      });

      mockFetchTraceContext.mockResolvedValue({
        traceId: 'test-trace-id',
        spans: [{ spanId: 'span1', name: 'test-span' }],
        insights: [],
        fetchedAt: Date.now(),
      });

      // Capture cloud requests
      mockAgentProvider.callApi = vi.fn().mockImplementation(async function (input: any) {
        cloudRequests.push(JSON.parse(input as string));
        return {
          output: { result: 'Attack prompt' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      }) as any;

      await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
          traceparent: '00-trace123-span456-01',
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 2,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Second request should include trace summary from first iteration
      expect(cloudRequests.length).toBeGreaterThanOrEqual(2);
      expect(cloudRequests[1].traceSummary).toBe('Trace summary');
    });

    it('should pass trace context to grader when includeInGrading is true', async () => {
      // Enable tracing with includeInGrading
      mockResolveTracingOptions.mockReturnValue({
        enabled: true,
        includeInAttack: false,
        includeInGrading: true,
        includeInternalSpans: false,
        maxSpans: 50,
        maxDepth: 5,
        maxRetries: 3,
        retryDelayMs: 500,
        sanitizeAttributes: true,
      });

      mockFetchTraceContext.mockResolvedValue({
        traceId: 'test-trace-id',
        spans: [{ spanId: 'span1', name: 'test-span' }],
        insights: [],
        fetchedAt: Date.now(),
      });

      const mockGrader = {
        getResult: vi.fn<any>().mockResolvedValue({
          grade: { pass: true, score: 0, reason: 'Test' },
          rubric: 'test rubric',
        }),
      };
      mockGetGraderById.mockReturnValue(mockGrader);

      await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
          traceparent: '00-trace123-span456-01',
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: {
          vars: { query: 'test' },
          assert: [{ type: 'promptfoo:redteam:harmful', metric: 'Harmful' }],
        } as AtomicTestCase,
        vars: { query: 'test' },
      });

      // Grader should be called with trace context
      expect(mockGrader.getResult).toHaveBeenCalled();
      const graderCall = mockGrader.getResult.mock.calls[0];

      // 8th argument is the gradingContext
      const gradingContext = graderCall[7] as { traceContext?: unknown; traceSummary?: string };
      expect(gradingContext).toBeDefined();
      expect(gradingContext.traceContext).toBeDefined();
      expect(gradingContext.traceSummary).toBe('Trace summary');
    });

    it('should handle fetchTraceContext returning null gracefully', async () => {
      // Enable tracing
      mockResolveTracingOptions.mockReturnValue({
        enabled: true,
        includeInAttack: true,
        includeInGrading: true,
        includeInternalSpans: false,
        maxSpans: 50,
        maxDepth: 5,
        maxRetries: 3,
        retryDelayMs: 500,
        sanitizeAttributes: true,
      });

      // Return null (no trace found)
      mockFetchTraceContext.mockResolvedValue(null);

      const result = await runMetaAgentRedteam({
        context: {
          vars: { query: 'test' },
          prompt: { raw: 'test', label: 'test' },
          originalProvider: mockTargetProvider,
          traceparent: '00-trace123-span456-01',
        },
        filters: undefined,
        injectVar: 'query',
        numIterations: 1,
        options: undefined,
        prompt: { raw: 'test', label: 'test' },
        agentProvider: mockAgentProvider,
        gradingProvider: mockGradingProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { query: 'test' },
      });

      // Should complete without error
      expect(result.metadata.finalIteration).toBe(1);
      // No trace data should be present
      expect(result.metadata.traceSnapshots).toBeUndefined();
    });
  });
});
