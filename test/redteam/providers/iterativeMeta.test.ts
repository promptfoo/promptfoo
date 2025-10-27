import { jest } from '@jest/globals';

import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import type { ApiProvider, AtomicTestCase, ProviderResponse } from '../../../src/types';

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
          shouldAbandon: false,
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

    it('should stop early on agent abandon', async () => {
      mockAgentProvider.callApi = jest
        .fn<() => Promise<ProviderResponse>>()
        .mockResolvedValueOnce({
          output: { result: 'First attempt', shouldAbandon: false },
        })
        .mockResolvedValueOnce({
          output: { result: 'Second attempt', shouldAbandon: true },
        });

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
        test: undefined,
        vars: { query: 'test' },
      });

      // Should stop at iteration 2 due to abandon
      expect(result.metadata.finalIteration).toBe(2);
      expect(result.metadata.stopReason).toBe('Agent abandoned');
    });

    it('should handle agent provider errors gracefully', async () => {
      mockAgentProvider.callApi = jest
        .fn<() => Promise<ProviderResponse>>()
        .mockResolvedValueOnce({ error: 'Agent error' })
        .mockResolvedValueOnce({
          output: { result: 'Second attempt', shouldAbandon: false },
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
          shouldAbandon: false,
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
});
