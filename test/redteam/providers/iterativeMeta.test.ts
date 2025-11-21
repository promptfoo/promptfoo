import { jest } from '@jest/globals';

import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import type { ApiProvider, AtomicTestCase, ProviderResponse } from '../../../src/types/index';

const mockGetProvider = jest.fn<() => Promise<any>>();
const mockGetTargetResponse = jest.fn<() => Promise<any>>();

jest.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: mockGetProvider,
  },
  getTargetResponse: mockGetTargetResponse,
  createIterationContext: jest.fn<any>().mockResolvedValue({
    iterationVars: {},
    iterationContext: {},
  }),
}));

const mockGetGraderById = jest.fn();

jest.mock('../../../src/redteam/graders', () => ({
  getGraderById: mockGetGraderById,
}));

const mockShouldGenerateRemote = jest.fn(() => true);

jest.mock('../../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: mockShouldGenerateRemote,
}));

describe('RedteamIterativeMetaProvider', () => {
  let mockAgentProvider: jest.Mocked<ApiProvider>;
  let mockGradingProvider: jest.Mocked<ApiProvider>;
  let mockTargetProvider: jest.Mocked<ApiProvider>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock cloud agent provider - returns attack prompts
    mockAgentProvider = {
      id: jest.fn().mockReturnValue('mock-agent'),
      callApi: jest.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
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
    } as jest.Mocked<ApiProvider>;

    mockGradingProvider = {
      id: jest.fn().mockReturnValue('mock-grader'),
      callApi: jest.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: 'grader result',
      }),
    } as jest.Mocked<ApiProvider>;

    mockTargetProvider = {
      id: jest.fn().mockReturnValue('mock-target'),
      callApi: jest.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: 'I cannot help with that',
      }),
    } as jest.Mocked<ApiProvider>;

    mockGetProvider.mockImplementation(async () => mockAgentProvider);

    mockGetTargetResponse.mockResolvedValue({
      output: 'I cannot help with that',
    });

    mockGetGraderById.mockReturnValue({
      getResult: jest.fn<any>().mockResolvedValue({
        grade: {
          pass: true,
          score: 0,
          reason: 'Target defended',
        },
      }),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
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
        getResult: jest
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
      mockAgentProvider.callApi = jest
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
      mockAgentProvider.callApi = jest.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
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
});
