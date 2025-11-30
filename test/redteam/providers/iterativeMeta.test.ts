import { Mocked, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import type { ApiProvider, AtomicTestCase, ProviderResponse } from '../../../src/types/index';

const mockGetProvider = vi.hoisted(() => vi.fn<() => Promise<any>>());
const mockGetTargetResponse = vi.hoisted(() => vi.fn<() => Promise<any>>());

vi.mock('../../../src/redteam/providers/shared', async importOriginal => {
  return ({
    ...(await importOriginal()),

    redteamProviderManager: {
      getProvider: mockGetProvider,
    },

    getTargetResponse: mockGetTargetResponse,

    createIterationContext: vi.fn<any>().mockResolvedValue({
      iterationVars: {},
      iterationContext: {},
    })
  });
});

const mockGetGraderById = vi.hoisted(() => vi.fn());

vi.mock('../../../src/redteam/graders', async importOriginal => {
  return ({
    ...(await importOriginal()),
    getGraderById: mockGetGraderById
  });
});

const mockShouldGenerateRemote = vi.hoisted(() => vi.fn(() => true));

vi.mock('../../../src/redteam/remoteGeneration', async importOriginal => {
  return ({
    ...(await importOriginal()),
    shouldGenerateRemote: mockShouldGenerateRemote
  });
});

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

    mockGetProvider.mockImplementation(async function() {
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

  describe('Privacy protection - excludeTargetOutputFromAgenticAttackGeneration', () => {
    it('should NOT send target response to cloud when privacy is enabled', async () => {
      const sensitiveResponse = 'SENSITIVE: Credit Card 4111-1111-1111-1111, SSN 123-45-6789';
      const cloudRequests: any[] = [];
      const targetResponses = [sensitiveResponse, 'Target defended'];
      let targetCallCount = 0;

      // Override mockAgentProvider to capture requests
      mockAgentProvider.callApi = vi.fn().mockImplementation(async function(input: any) {
        cloudRequests.push(JSON.parse(input as string));
        return {
          output: { result: 'Next attack' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      }) as any;

      // Mock the targetProvider.callApi directly (not mockGetTargetResponse)
      mockTargetProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockImplementation(async function() {
          const response = { output: targetResponses[targetCallCount] || 'Default' };
          targetCallCount++;
          return response;
        }) as any;

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

      mockAgentProvider.callApi = vi.fn().mockImplementation(async function(input: any) {
        cloudRequests.push(JSON.parse(input as string));
        return {
          output: { result: 'Next attack' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      }) as any;

      // Mock the targetProvider.callApi directly
      mockTargetProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockImplementation(async function() {
          const response = { output: targetResponses[targetCallCount] || 'Default' };
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

      mockAgentProvider.callApi = vi.fn().mockImplementation(async function(input: any) {
        cloudRequests.push(JSON.parse(input as string));
        return {
          output: { result: 'Attack' },
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      }) as any;

      // Mock the targetProvider.callApi directly (not mockGetTargetResponse)
      mockTargetProvider.callApi = vi
        .fn<() => Promise<ProviderResponse>>()
        .mockImplementation(async function() {
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
});
