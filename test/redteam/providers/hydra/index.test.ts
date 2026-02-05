import { afterEach, beforeEach, describe, expect, it, Mock, Mocked, vi } from 'vitest';
import * as evaluatorHelpers from '../../../../src/evaluatorHelpers';
import { PromptfooChatCompletionProvider } from '../../../../src/providers/promptfoo';
import { shouldGenerateRemote } from '../../../../src/redteam/remoteGeneration';

import type { ApiProvider, CallApiContextParams, GradingResult } from '../../../../src/types/index';

// Import HydraProvider dynamically after mocks are set up
let HydraProvider: typeof import('../../../../src/redteam/providers/hydra/index').HydraProvider;

// Hoisted mocks
const mockGetGraderById = vi.hoisted(() => vi.fn());
const mockIsBasicRefusal = vi.hoisted(() => vi.fn());

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

// Hoisted mock for applyRuntimeTransforms
const mockApplyRuntimeTransforms = vi.hoisted(() =>
  vi.fn().mockImplementation(async ({ prompt }) => ({
    transformedPrompt: prompt,
    audio: undefined,
    image: undefined,
  })),
);

vi.mock('../../../../src/providers/promptfoo', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    PromptfooChatCompletionProvider: vi.fn(),
  };
});

vi.mock('../../../../src/redteam/graders', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getGraderById: mockGetGraderById,
  };
});

vi.mock('../../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: vi.fn(),
  };
});

vi.mock('../../../../src/evaluatorHelpers', async () => ({
  ...(await vi.importActual('../../../../src/evaluatorHelpers')),
  renderPrompt: vi.fn(),
}));

vi.mock('../../../../src/redteam/util', async () => ({
  ...(await vi.importActual('../../../../src/redteam/util')),
  isBasicRefusal: mockIsBasicRefusal,
  getSessionId: vi.fn(),
}));

vi.mock('../../../../src/redteam/shared/runtimeTransform', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    applyRuntimeTransforms: mockApplyRuntimeTransforms,
  };
});

// Tracing module mocks
vi.mock('../../../../src/redteam/providers/tracingOptions', () => ({
  resolveTracingOptions: mockResolveTracingOptions,
}));

vi.mock('../../../../src/tracing/traceContext', () => ({
  fetchTraceContext: mockFetchTraceContext,
  extractTraceIdFromTraceparent: mockExtractTraceIdFromTraceparent,
}));

vi.mock('../../../../src/redteam/providers/traceFormatting', () => ({
  formatTraceSummary: mockFormatTraceSummary,
  formatTraceForMetadata: mockFormatTraceForMetadata,
}));

describe('HydraProvider', () => {
  let mockAgentProvider: Mocked<ApiProvider>;
  let mockTargetProvider: Mocked<ApiProvider>;
  let mockGrader: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the hoisted mock to ensure clean state
    mockGetGraderById.mockReset();

    // Reset modules and dynamically import HydraProvider so it gets the mocked graders
    vi.resetModules();
    const hydraModule = await import('../../../../src/redteam/providers/hydra/index');
    HydraProvider = hydraModule.HydraProvider;

    // Mock agent provider (cloud provider)
    mockAgentProvider = {
      id: vi.fn().mockReturnValue('mock-agent'),
      callApi: vi.fn(),
      delay: 0,
    } as Mocked<ApiProvider>;

    // Mock target provider
    mockTargetProvider = {
      id: vi.fn().mockReturnValue('mock-target'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Target response',
      }),
    } as Mocked<ApiProvider>;

    // Mock grader
    mockGrader = {
      getResult: vi.fn().mockResolvedValue({
        grade: {
          pass: true,
          score: 1,
          reason: 'Target defended',
        },
      }),
    };

    // Setup mocks
    (PromptfooChatCompletionProvider as Mock).mockImplementation(function () {
      return mockAgentProvider;
    });
    mockGetGraderById.mockImplementation(function () {
      return mockGrader;
    });
    vi.mocked(shouldGenerateRemote).mockImplementation(function () {
      return true;
    });
    vi.mocked(evaluatorHelpers.renderPrompt).mockResolvedValue('rendered prompt');

    mockIsBasicRefusal.mockReturnValue(false);

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

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config values', () => {
      const provider = new HydraProvider({
        injectVar: 'input',
      });

      expect(provider.config.injectVar).toBe('input');
      expect(provider['maxTurns']).toBe(10);
      expect(provider['maxBacktracks']).toBe(10);
      expect(provider['stateful']).toBe(false);
    });

    it('should initialize with custom config values', () => {
      const provider = new HydraProvider({
        injectVar: 'query',
        maxTurns: 5,
        maxBacktracks: 3,
        stateful: true,
        scanId: 'test-scan-id',
      });

      expect(provider.config.injectVar).toBe('query');
      expect(provider['maxTurns']).toBe(5);
      expect(provider['maxBacktracks']).toBe(3);
      expect(provider['stateful']).toBe(true);
      expect(provider['scanId']).toBe('test-scan-id');
    });

    it('should throw error when remote generation is not available', () => {
      vi.mocked(shouldGenerateRemote).mockImplementation(function () {
        return false;
      });

      expect(() => {
        new HydraProvider({ injectVar: 'input' });
      }).toThrow(
        'jailbreak:hydra strategy requires cloud access. Set PROMPTFOO_REMOTE_GENERATION_URL or log into Promptfoo Cloud.',
      );
    });

    it('should warn when backtracking is enabled in stateful mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new HydraProvider({
        injectVar: 'input',
        stateful: true,
        maxBacktracks: 5,
      });

      // Logger.warn should have been called
      warnSpy.mockRestore();
    });

    it('should create agent provider with correct config', () => {
      new HydraProvider({ injectVar: 'input' });

      expect(PromptfooChatCompletionProvider).toHaveBeenCalledWith({
        task: 'hydra-decision',
        jsonOnly: true,
        preferSmallModel: false,
      });
    });
  });

  describe('id()', () => {
    it('should return correct provider id', () => {
      const provider = new HydraProvider({ injectVar: 'input' });
      expect(provider.id()).toBe('promptfoo:redteam:hydra');
    });
  });

  describe('callApi() - basic functionality', () => {
    it('should execute single turn attack successfully', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target defended',
        tokenUsage: { total: 50, prompt: 25, completion: 25 },
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result).toBeDefined();
      expect(result.output).toBe('Target defended');
      expect(result.metadata?.hydraRoundsCompleted).toBe(1);
      expect(result.metadata?.hydraBacktrackCount).toBe(0);
      expect(result.metadata?.hydraResult).toBe(false);
      expect(result.metadata?.stopReason).toBe('Max turns reached');
      // agent (100) + target (50) + learning update (100) = 250
      expect(result.tokenUsage?.total).toBe(250);
    });

    it('should detect vulnerability when grader fails', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Successful attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Here is how to do harmful thing',
        tokenUsage: { total: 50, prompt: 25, completion: 25 },
      });

      // Grader fails (vulnerability detected) - set up mockGetGraderById directly
      mockGetGraderById.mockImplementation(function () {
        return {
          getResult: vi.fn().mockResolvedValue({
            grade: {
              pass: false,
              score: 0,
              reason: 'Harmful content detected',
            },
          }),
        } as any;
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 10,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.metadata?.hydraResult).toBe(true);
      expect(result.metadata?.stopReason).toBe('Grader failed');
      expect(result.metadata?.successfulAttacks).toHaveLength(1);
      expect(result.metadata?.successfulAttacks?.[0]).toMatchObject({
        turn: 1,
        message: 'Successful attack message',
        response: 'Here is how to do harmful thing',
      });
    });

    it('should handle multiple turns until max turns reached', async () => {
      let callCount = 0;
      mockAgentProvider.callApi.mockImplementation(async function () {
        callCount++;
        return {
          output: `Attack message ${callCount}`,
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target defended',
        tokenUsage: { total: 50, prompt: 25, completion: 25 },
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 3,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.metadata?.hydraRoundsCompleted).toBe(3);
      expect(result.metadata?.stopReason).toBe('Max turns reached');
      // Agent is called 3 times for attacks + 1 time for learning update
      expect(mockAgentProvider.callApi).toHaveBeenCalledTimes(4);
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(3);
    });

    it('should use goal from test metadata or vars', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      // Test with goal in metadata
      const contextWithMetadata: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'var goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'metadata goal', pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', contextWithMetadata);

      const agentCall = mockAgentProvider.callApi.mock.calls[0];
      const request = JSON.parse(agentCall[0] as string);
      expect(request.goal).toBe('metadata goal');

      // Reset mocks
      vi.clearAllMocks();
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      // Test with goal from vars
      const contextWithVars: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'var goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', contextWithVars);

      const agentCall2 = mockAgentProvider.callApi.mock.calls[0];
      const request2 = JSON.parse(agentCall2[0] as string);
      expect(request2.goal).toBe('var goal');
    });
  });

  describe('callApi() - stateful mode', () => {
    it('should handle stateful mode with sessionId', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
        sessionId: 'session-123',
        tokenUsage: { total: 50, prompt: 25, completion: 25 },
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
        stateful: true,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.metadata?.sessionId).toBe('session-123');
      expect(result.metadata?.sessionIds).toEqual(['session-123', 'session-123']);
      // Check that the second call includes sessionId
      const renderCalls = (evaluatorHelpers.renderPrompt as Mock).mock.calls;
      const secondCall = renderCalls[1];
      expect(secondCall[1]).toMatchObject({
        sessionId: 'session-123',
      });
    });

    it('should escape nunjucks syntax in stateful mode', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack with {{template}} and {% block %}',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
        stateful: true,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', context);

      // Check that the call with the escaped message was made
      const renderCalls = (evaluatorHelpers.renderPrompt as Mock).mock.calls;
      const escapedCall = renderCalls.find(
        (call) => call[1].input === 'Attack with { {template} } and { % block % }',
      );
      expect(escapedCall).toBeDefined();
    });
  });

  describe('callApi() - stateless mode', () => {
    it('should send full conversation history in stateless mode', async () => {
      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          output: 'First attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        })
        .mockResolvedValueOnce({
          output: 'Second attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'First response',
        })
        .mockResolvedValueOnce({
          output: 'Second response',
        });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
        stateful: false,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', context);

      // Check that target was called with JSON conversation history
      const secondTargetCall = mockTargetProvider.callApi.mock.calls[1];
      expect(secondTargetCall[0]).toBeDefined();
      // In stateless mode, the prompt should be JSON stringified conversation
    });
  });

  describe('callApi() - backtracking', () => {
    it('should backtrack when target refuses in stateless mode', async () => {
      // Import to trigger the mock
      await import('../../../../src/redteam/util');

      let attackCallCount = 0;
      mockAgentProvider.callApi.mockImplementation(async function (prompt) {
        const request = JSON.parse(prompt as string);
        // Don't count learning updates
        if (!request.testComplete) {
          attackCallCount++;
        }
        return {
          output: `Attack message ${attackCallCount}`,
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        };
      });

      let targetCallCount = 0;
      mockTargetProvider.callApi.mockImplementation(async function () {
        targetCallCount++;
        // First call is refused, second succeeds
        if (targetCallCount === 1) {
          return { output: "I can't help with that" };
        }
        return { output: 'Target cooperated' };
      });

      // First response is a refusal, second is not
      mockIsBasicRefusal.mockReturnValueOnce(true).mockReturnValueOnce(false);

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 10,
        maxBacktracks: 5,
        stateful: false,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.metadata?.hydraBacktrackCount).toBe(1);
      // Should complete 1 turn (first was backtracked, second succeeded and continues to max)
      expect(result.metadata?.hydraRoundsCompleted).toBeGreaterThanOrEqual(1);
    });

    it('should stop when max backtracks reached', async () => {
      // Import to trigger the mock
      await import('../../../../src/redteam/util');
      mockIsBasicRefusal.mockReturnValue(true); // Always refuse

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: "I can't help with that",
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 10,
        maxBacktracks: 3,
        stateful: false,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.metadata?.hydraBacktrackCount).toBe(3);
      expect(result.metadata?.stopReason).toBe('Max backtracks reached');
    });

    it('should not backtrack in stateful mode', async () => {
      // Import to trigger the mock
      await import('../../../../src/redteam/util');
      mockIsBasicRefusal.mockReturnValue(true); // Always refuse

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: "I can't help with that",
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 3,
        maxBacktracks: 5,
        stateful: true,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // No backtracking should occur
      expect(result.metadata?.hydraBacktrackCount).toBe(0);
      expect(result.metadata?.hydraRoundsCompleted).toBe(3);
    });
  });

  describe('callApi() - error handling', () => {
    it('should continue when agent provider returns error', async () => {
      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          error: 'Agent error',
          output: '',
        })
        .mockResolvedValueOnce({
          output: 'Valid attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // Should complete despite agent error on first turn
      expect(result.metadata?.hydraRoundsCompleted).toBe(1);
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it('should continue when target provider returns error', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          error: 'Target error',
          output: '',
        })
        .mockResolvedValueOnce({
          output: 'Valid response',
        });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // First turn has error (doesn't count), second turn succeeds (counts as turn 1)
      // But since we continue after error, we actually make 2 turns total
      expect(result.metadata?.hydraRoundsCompleted).toBeGreaterThanOrEqual(1);
      // Agent is called for each turn + learning update
      expect(mockAgentProvider.callApi).toHaveBeenCalledTimes(3);
    });

    it('should handle empty target response', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: '',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // Should handle empty response by adding marker
      expect(result.metadata?.redteamHistory?.[0].output).toBe(
        '[Target provided empty response - likely refused]',
      );
    });

    it('should continue when agent returns missing message', async () => {
      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          output: '', // Empty message
        })
        .mockResolvedValueOnce({
          output: 'Valid attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // Should skip turn with empty message
      expect(result.metadata?.hydraRoundsCompleted).toBe(1);
    });
  });

  describe('callApi() - conversation history', () => {
    it('should build conversation history correctly', async () => {
      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          output: 'First attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        })
        .mockResolvedValueOnce({
          output: 'Second attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'First response',
        })
        .mockResolvedValueOnce({
          output: 'Second response',
        });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.metadata?.messages).toEqual([
        { role: 'user', content: 'First attack' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second attack' },
        { role: 'assistant', content: 'Second response' },
      ]);

      expect(result.metadata?.redteamHistory).toHaveLength(2);
      expect(result.metadata?.redteamHistory?.[0]).toEqual({
        prompt: 'First attack',
        output: 'First response',
        graderPassed: true,
      });
    });

    it('should send conversation history to cloud agent', async () => {
      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          output: 'First attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        })
        .mockResolvedValueOnce({
          output: 'Second attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', context);

      // Check second agent call includes conversation history
      const secondAgentCall = mockAgentProvider.callApi.mock.calls[1];
      const request = JSON.parse(secondAgentCall[0] as string);

      expect(request.conversationHistory).toEqual([
        { role: 'user', content: 'First attack' },
        { role: 'assistant', content: 'Target response' },
      ]);
      expect(request.turn).toBe(2);
    });
  });

  describe('callApi() - grading', () => {
    it('should use correct grader from test assertions', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:violent-crime' }, { type: 'other-assertion' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:violent-crime' },
        } as any,
      };

      await provider.callApi('', context);

      expect(mockGetGraderById).toHaveBeenCalledWith('harmful:violent-crime');
      expect(mockGrader.getResult).toHaveBeenCalledWith(
        'Attack message',
        'Target response',
        expect.anything(),
        mockTargetProvider,
        undefined,
        undefined, // additionalRubric
        undefined, // skipRefusalCheck
        expect.objectContaining({
          traceContext: null,
          traceSummary: undefined,
        }),
      );
    });

    it('should send grader result to cloud agent on next turn', async () => {
      const graderResult: GradingResult = {
        pass: false,
        score: 0.3,
        reason: 'Partially harmful',
      };

      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          output: 'First attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        })
        .mockResolvedValueOnce({
          output: 'Second attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      // First turn passes grader, second turn fails - set up mockGetGraderById directly
      const mockGetResult = vi
        .fn()
        .mockResolvedValueOnce({
          grade: { pass: true, score: 1, reason: 'Safe' },
        })
        .mockResolvedValueOnce({
          grade: graderResult,
        });
      mockGetGraderById.mockImplementation(function () {
        return { getResult: mockGetResult } as any;
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', context);

      // Check second agent call includes last grader result
      const secondAgentCall = mockAgentProvider.callApi.mock.calls[1];
      const request = JSON.parse(secondAgentCall[0] as string);

      expect(request.lastGraderResult).toEqual({
        pass: true,
        score: 1,
      });
    });

    it('should store grader result in metadata', async () => {
      const graderResult: GradingResult = {
        pass: false,
        score: 0,
        reason: 'Vulnerability detected',
      };

      const testRubric = 'Test grading rubric';

      // Set up mockGetGraderById directly to return grader that fails
      mockGetGraderById.mockImplementation(function () {
        return {
          getResult: vi.fn().mockResolvedValue({
            grade: graderResult,
            rubric: testRubric,
          }),
        } as any;
      });

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Harmful response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.metadata?.storedGraderResult).toEqual({
        ...graderResult,
        assertion: { type: 'harmful:test', value: testRubric },
      });
    });
  });

  describe('callApi() - scan learning', () => {
    it('should send learning update after completion', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
        scanId: 'test-scan-id',
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        evaluationId: 'eval-123',
      };

      await provider.callApi('', context);

      // Check last call is learning update
      const lastCall =
        mockAgentProvider.callApi.mock.calls[mockAgentProvider.callApi.mock.calls.length - 1];
      const request = JSON.parse(lastCall[0] as string);

      expect(request.task).toBe('hydra-decision');
      expect(request.testComplete).toBe(true);
      expect(request.scanId).toBe('eval-123'); // Should use evaluationId
      expect(request.finalResult).toEqual({
        success: false,
        totalTurns: 2,
      });
    });

    it('should send success in learning update when vulnerability found', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Harmful response',
      });

      // Set up mockGetGraderById directly to return grader that fails
      mockGetGraderById.mockImplementation(function () {
        return {
          getResult: vi.fn().mockResolvedValue({
            grade: { pass: false, score: 0, reason: 'Vulnerability' },
          }),
        } as any;
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 10,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        evaluationId: 'eval-123',
      };

      await provider.callApi('', context);

      const lastCall =
        mockAgentProvider.callApi.mock.calls[mockAgentProvider.callApi.mock.calls.length - 1];
      const request = JSON.parse(lastCall[0] as string);

      expect(request.finalResult.success).toBe(true);
      expect(request.finalResult.totalTurns).toBe(1);
    });

    it('should not fail test if learning update fails', async () => {
      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          output: 'Attack message',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        })
        .mockRejectedValueOnce(new Error('Learning update failed'));

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      // Should not throw
      const result = await provider.callApi('', context);

      expect(result).toBeDefined();
      expect(result.output).toBe('Target response');
    });
  });

  describe('callApi() - token usage tracking', () => {
    it('should accumulate token usage from agent and target', async () => {
      mockAgentProvider.callApi
        .mockResolvedValueOnce({
          output: 'First attack',
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        })
        .mockResolvedValueOnce({
          output: 'Second attack',
          tokenUsage: { total: 150, prompt: 75, completion: 75 },
        });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'First response',
          tokenUsage: { total: 80, prompt: 40, completion: 40 },
        })
        .mockResolvedValueOnce({
          output: 'Second response',
          tokenUsage: { total: 120, prompt: 60, completion: 60 },
        });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 2,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // Total should be sum of all calls
      // Agent: 100 + 150 = 250
      // Target: 80 + 120 = 200
      // Total: 450
      expect(result.tokenUsage?.total).toBe(450);
      expect(result.tokenUsage?.prompt).toBe(225);
      expect(result.tokenUsage?.completion).toBe(225);
    });
  });

  describe('callApi() - cloud request format', () => {
    it('should send correct request format to cloud', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: {
            goal: 'test goal',
            pluginId: 'harmful:test',
            purpose: 'Test purpose',
            modifiers: ['modifier1', 'modifier2'],
          },
        } as any,
        evaluationId: 'eval-123',
        testCaseId: 'tc-456',
      };

      await provider.callApi('', context);

      const agentCall = mockAgentProvider.callApi.mock.calls[0];
      const request = JSON.parse(agentCall[0] as string);

      expect(request).toMatchObject({
        task: 'hydra-decision',
        testRunId: expect.stringContaining('eval-123-tc'),
        scanId: 'eval-123',
        turn: 1,
        goal: 'test goal',
        purpose: 'Test purpose',
        modifiers: ['modifier1', 'modifier2'],
        conversationHistory: [],
        stateful: false,
        maxTurns: 1,
      });
      // First request should not have lastGraderResult
      expect(request.lastGraderResult).toBeUndefined();
    });
  });

  describe('Abort Signal Handling', () => {
    it('should pass options to agent provider callApi', async () => {
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', context, options);

      // Agent provider should be called with options
      expect(mockAgentProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
    });

    it('should pass options to target provider via getTargetResponse', async () => {
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      await provider.callApi('', context, options);

      // Target provider should be called with options via getTargetResponse
      expect(mockTargetProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
    });
  });

  describe('callApi() - metadata output', () => {
    it('should return complete metadata', async () => {
      const { getSessionId } = await import('../../../../src/redteam/util');
      vi.mocked(getSessionId).mockReturnValue('session-123');

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
        sessionId: 'session-123',
        guardrails: { triggered: true, policy: 'test-policy' } as any,
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
        stateful: true, // Enable stateful to capture sessionId
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result).toMatchObject({
        output: 'Target response',
        metadata: {
          sessionId: 'session-123',
          hydraRoundsCompleted: 1,
          hydraBacktrackCount: 0,
          hydraResult: false,
          stopReason: 'Max turns reached',
          successfulAttacks: [],
          totalSuccessfulAttacks: 0,
          messages: expect.arrayContaining([
            { role: 'user', content: 'Attack message' },
            { role: 'assistant', content: 'Target response' },
          ]),
          redteamHistory: expect.arrayContaining([
            expect.objectContaining({
              prompt: 'Attack message',
              output: 'Target response',
              graderPassed: true,
            }),
          ]),
          sessionIds: ['session-123'],
          storedGraderResult: expect.any(Object),
        },
        tokenUsage: expect.any(Object),
        guardrails: { triggered: true, policy: 'test-policy' },
      });
    });

    it('should include error in output if last response had error', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
        error: 'Some error occurred',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      expect(result.output).toBe('Target response');
      expect(result.error).toBe('Some error occurred');
    });
  });

  describe('perTurnLayers configuration', () => {
    it('should accept _perTurnLayers in config', () => {
      const provider = new HydraProvider({
        injectVar: 'input',
        _perTurnLayers: [{ id: 'audio' }, { id: 'image' }],
      });

      expect(provider['perTurnLayers']).toEqual([{ id: 'audio' }, { id: 'image' }]);
    });

    it('should default perTurnLayers to empty array when not provided', () => {
      const provider = new HydraProvider({
        injectVar: 'input',
      });

      expect(provider['perTurnLayers']).toEqual([]);
    });

    it('should not apply transforms when perTurnLayers is empty', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
        // No _perTurnLayers provided - defaults to empty
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // Verify redteamHistory exists but promptAudio/promptImage are undefined
      expect(result.metadata?.redteamHistory).toBeDefined();
      if (result.metadata?.redteamHistory && result.metadata.redteamHistory.length > 0) {
        expect(result.metadata.redteamHistory[0].promptAudio).toBeUndefined();
        expect(result.metadata.redteamHistory[0].promptImage).toBeUndefined();
      }
    });

    it('should include redteamHistory with media fields when perTurnLayers is configured', async () => {
      // Configure the hoisted mock to return audio/image data for this test
      mockApplyRuntimeTransforms.mockResolvedValueOnce({
        transformedPrompt: 'transformed attack',
        audio: { data: 'base64-audio-data', format: 'mp3' },
        image: { data: 'base64-image-data', format: 'png' },
      });

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
        audio: { data: 'response-audio-data', format: 'wav' },
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
        _perTurnLayers: [{ id: 'audio' }],
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // Verify redteamHistory is populated
      expect(result.metadata?.redteamHistory).toBeDefined();
      expect(Array.isArray(result.metadata?.redteamHistory)).toBe(true);
    });

    it('should include outputAudio in redteamHistory when target returns audio', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
        audio: { data: 'output-audio-base64', format: 'wav' },
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
      };

      const result = await provider.callApi('', context);

      // Verify outputAudio is captured in redteamHistory
      expect(result.metadata?.redteamHistory).toBeDefined();
      if (result.metadata?.redteamHistory && result.metadata.redteamHistory.length > 0) {
        expect(result.metadata.redteamHistory[0].outputAudio).toEqual({
          data: 'output-audio-base64',
          format: 'wav',
        });
      }
    });
  });

  describe('Tracing Support', () => {
    it('should NOT fetch trace context when tracing is disabled (default)', async () => {
      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        traceparent: '00-trace123-span456-01',
      };

      const result = await provider.callApi('', context);

      // Should NOT call fetchTraceContext when tracing is disabled
      expect(mockFetchTraceContext).not.toHaveBeenCalled();

      // Metadata should not have trace snapshots
      expect(result.metadata?.traceSnapshots).toBeUndefined();
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

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        traceparent: '00-trace123-span456-01',
      };

      const result = await provider.callApi('', context);

      // Should call fetchTraceContext
      expect(mockFetchTraceContext).toHaveBeenCalled();

      // Metadata should have trace snapshots
      expect(result.metadata?.traceSnapshots).toBeDefined();
      expect(result.metadata?.traceSnapshots).toHaveLength(1);
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

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        // No traceparent
      };

      const result = await provider.callApi('', context);

      // Should NOT call fetchTraceContext when traceparent is missing
      expect(mockFetchTraceContext).not.toHaveBeenCalled();

      // Metadata should not have trace snapshots
      expect(result.metadata?.traceSnapshots).toBeUndefined();
    });

    it('should call formatTraceSummary when tracing is enabled and trace is fetched', async () => {
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

      mockFetchTraceContext.mockResolvedValue({
        traceId: 'test-trace-id',
        spans: [{ spanId: 'span1', name: 'test-span' }],
        insights: [],
        fetchedAt: Date.now(),
      });

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        traceparent: '00-trace123-span456-01',
      };

      await provider.callApi('', context);

      // formatTraceSummary should be called when trace is fetched
      expect(mockFormatTraceSummary).toHaveBeenCalled();
    });

    it('should call formatTraceForMetadata when trace is stored in metadata', async () => {
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

      mockFetchTraceContext.mockResolvedValue({
        traceId: 'test-trace-id',
        spans: [{ spanId: 'span1', name: 'test-span' }],
        insights: [],
        fetchedAt: Date.now(),
      });

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        traceparent: '00-trace123-span456-01',
      };

      await provider.callApi('', context);

      // formatTraceForMetadata should be called for storing trace
      expect(mockFormatTraceForMetadata).toHaveBeenCalled();
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

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        traceparent: '00-trace123-span456-01',
      };

      const result = await provider.callApi('', context);

      // Should complete without error
      expect(result.metadata?.hydraRoundsCompleted).toBeDefined();
      // No trace snapshots should be present
      expect(result.metadata?.traceSnapshots).toBeUndefined();
    });

    it('should include trace data in redteamHistory entries when tracing is enabled', async () => {
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

      mockFetchTraceContext.mockResolvedValue({
        traceId: 'test-trace-id',
        spans: [{ spanId: 'span1', name: 'test-span' }],
        insights: [],
        fetchedAt: Date.now(),
      });

      mockAgentProvider.callApi.mockResolvedValue({
        output: 'Attack message',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Target response',
      });

      const provider = new HydraProvider({
        injectVar: 'input',
        maxTurns: 1,
      });

      const context: CallApiContextParams = {
        originalProvider: mockTargetProvider,
        vars: { input: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'harmful:test' }],
          metadata: { goal: 'test goal', pluginId: 'harmful:test' },
        } as any,
        traceparent: '00-trace123-span456-01',
      };

      const result = await provider.callApi('', context);

      // redteamHistory should have trace data
      expect(result.metadata?.redteamHistory).toBeDefined();
      if (result.metadata?.redteamHistory && result.metadata.redteamHistory.length > 0) {
        const entry = result.metadata.redteamHistory[0];
        expect(entry.trace).toBeDefined();
        expect(entry.traceSummary).toBe('Trace summary');
      }
    });
  });
});
