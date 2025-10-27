import { SimulatedUser } from '../../src/providers/simulatedUser';
import * as timeUtils from '../../src/util/time';

import type { ApiProvider } from '../../src/types/index';

jest.mock('../../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/util/fetch/index.ts');

// Mock PromptfooSimulatedUserProvider
const mockUserProviderCallApi = jest.fn().mockResolvedValue({ output: 'user response' });
jest.mock('../../src/providers/promptfoo', () => {
  return {
    PromptfooSimulatedUserProvider: jest.fn().mockImplementation(() => ({
      callApi: mockUserProviderCallApi,
      id: jest.fn().mockReturnValue('mock-user-provider'),
      options: {},
    })),
  };
});

describe('SimulatedUser', () => {
  let simulatedUser: SimulatedUser;
  let originalProvider: ApiProvider;

  beforeEach(() => {
    mockUserProviderCallApi.mockClear();
    mockUserProviderCallApi.mockResolvedValue({ output: 'user response' });

    originalProvider = {
      id: () => 'test-agent',
      callApi: jest.fn().mockImplementation(async () => ({
        output: 'agent response',
        tokenUsage: { numRequests: 1 },
      })),
    };

    simulatedUser = new SimulatedUser({
      id: 'test-agent',
      config: {
        instructions: 'test instructions',
        maxTurns: 2,
      },
    });

    jest.clearAllMocks();
  });

  describe('id()', () => {
    it('should return the identifier', () => {
      expect(simulatedUser.id()).toBe('test-agent');
    });

    it('should use label as fallback identifier', () => {
      const userWithLabel = new SimulatedUser({
        label: 'label-agent',
        config: {},
      });
      expect(userWithLabel.id()).toBe('label-agent');
    });

    it('should use default identifier if no id or label provided', () => {
      const userWithoutId = new SimulatedUser({ config: {} });
      expect(userWithoutId.id()).toBe('agent-provider');
    });
  });

  describe('callApi()', () => {
    it('should simulate conversation between user and agent', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('User:');
      expect(result.output).toContain('Assistant:');
      expect(result.tokenUsage?.numRequests).toBe(2);
      expect(originalProvider.callApi).toHaveBeenCalledTimes(2);
      expect(timeUtils.sleep).not.toHaveBeenCalled();
    });

    it('should respect maxTurns configuration', async () => {
      const userWithMaxTurns = new SimulatedUser({
        config: {
          instructions: 'test instructions',
          maxTurns: 1,
        },
      });

      const result = await userWithMaxTurns.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      const messageCount = result.output?.split('---').length;
      expect(messageCount).toBe(2);
      expect(originalProvider.callApi).toHaveBeenCalledTimes(1);
      expect(timeUtils.sleep).not.toHaveBeenCalled();
    });

    it('should stop conversation when ###STOP### is received', async () => {
      // Set up an initial message exchange to have some conversation history
      // First call is regular exchange
      const mockedCallApi = jest.mocked(originalProvider.callApi);
      mockedCallApi.mockImplementationOnce(async () => ({
        output: 'initial agent response',
        tokenUsage: { numRequests: 1 },
      }));

      // Second call returns stop command
      mockUserProviderCallApi
        .mockResolvedValueOnce({ output: 'initial user response' }) // First user response
        .mockResolvedValueOnce({ output: 'stopping now ###STOP###' }); // Second user response with STOP

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).not.toContain('stopping now ###STOP###');
      // The original provider should be called once for the first exchange
      expect(originalProvider.callApi).toHaveBeenCalledTimes(1);
      expect(timeUtils.sleep).not.toHaveBeenCalled();
    });

    it('should throw error if originalProvider is not provided', async () => {
      await expect(
        simulatedUser.callApi('test', {
          vars: {},
          prompt: { raw: 'test', display: 'test', label: 'test' },
        }),
      ).rejects.toThrow('Expected originalProvider to be set');
    });

    it('should pass context with vars to the target provider', async () => {
      const testContext = {
        originalProvider,
        vars: {
          workflow_id: '123-workflow',
          session_id: '123-session',
          instructions: 'test instructions',
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      };

      const result = await simulatedUser.callApi('test prompt', testContext);

      expect(result.output).toBeDefined();
      expect(originalProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining(
          '[{"role":"system","content":"test"},{"role":"user","content":"user response"}',
        ),
        expect.objectContaining({
          vars: expect.objectContaining({
            workflow_id: '123-workflow',
            session_id: '123-session',
            instructions: 'test instructions',
          }),
        }),
      );
    });

    it('should handle provider delay', async () => {
      const providerWithDelay = {
        ...originalProvider,
        delay: 100,
      };

      const result = await simulatedUser.callApi(
        'test prompt',
        {
          originalProvider: providerWithDelay,
          vars: { instructions: 'test instructions' },
          prompt: { raw: 'test', display: 'test', label: 'test' },
        },
        { includeLogProbs: false },
      );

      expect(result.output).toBeDefined();
      expect(providerWithDelay.callApi).toHaveBeenCalledTimes(2);
      expect(timeUtils.sleep).toHaveBeenCalledWith(100);
    });

    it('should include sessionId from agentResponse in metadata', async () => {
      const providerWithSessionId = {
        id: () => 'test-agent',
        callApi: jest.fn().mockImplementation(async () => ({
          output: 'agent response',
          sessionId: 'test-session-123',
          tokenUsage: { numRequests: 1 },
        })),
      };

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider: providerWithSessionId,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.metadata?.sessionId).toBe('test-session-123');
    });

    it('should include sessionId from context.vars as fallback', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions', sessionId: 'vars-session-456' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.metadata?.sessionId).toBe('vars-session-456');
    });

    it('should prioritize agentResponse.sessionId over context.vars.sessionId', async () => {
      const providerWithSessionId = {
        id: () => 'test-agent',
        callApi: jest.fn().mockImplementation(async () => ({
          output: 'agent response',
          sessionId: 'response-session-priority',
          tokenUsage: { numRequests: 1 },
        })),
      };

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider: providerWithSessionId,
        vars: { instructions: 'test instructions', sessionId: 'vars-session-ignored' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.metadata?.sessionId).toBe('response-session-priority');
      expect(result.metadata?.sessionId).not.toBe('vars-session-ignored');
    });

    it('should handle missing sessionId gracefully', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.metadata?.sessionId).toBeUndefined();
    });

    it('should stringify non-string sessionId in vars', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions', sessionId: 123 as any },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.metadata?.sessionId).toBe('123');
    });
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      expect(simulatedUser.toString()).toBe('AgentProvider');
    });
  });

  describe('prompt handling', () => {
    it('should include the assistant prompt/instructions when calling the agent', async () => {
      const assistantPrompt =
        'You are a helpful assistant. You must follow these specific instructions.';
      const testContext = {
        originalProvider,
        vars: { instructions: 'test user instructions' },
        prompt: { raw: assistantPrompt, display: assistantPrompt, label: 'test-prompt' },
      };

      await simulatedUser.callApi('test prompt', testContext);

      const callApiCalls = jest.mocked(originalProvider.callApi).mock.calls;
      expect(callApiCalls.length).toBeGreaterThan(0);

      const firstCall = callApiCalls[0];
      const promptArg = firstCall[0] as string;

      // Verify the assistant prompt is included in the call to the agent
      expect(promptArg).toContain(assistantPrompt);
    });

    it('should include system prompt on first turn only for stateful providers', async () => {
      const providerWithSessionId = {
        id: () => 'test-agent',
        callApi: jest
          .fn()
          .mockImplementationOnce(async () => ({
            output: 'first response',
            sessionId: 'session-123',
            tokenUsage: { numRequests: 1 },
          }))
          .mockImplementationOnce(async () => ({
            output: 'second response',
            sessionId: 'session-123',
            tokenUsage: { numRequests: 1 },
          })),
      };

      const statefulUser = new SimulatedUser({
        id: 'stateful-agent',
        config: {
          instructions: 'test instructions',
          maxTurns: 2,
          stateful: true,
        },
      });

      const assistantPrompt = 'You are a stateful assistant.';
      const testContext = {
        originalProvider: providerWithSessionId,
        vars: { instructions: 'test user instructions' },
        prompt: { raw: assistantPrompt, display: assistantPrompt, label: 'test-prompt' },
      };

      await statefulUser.callApi('test prompt', testContext);

      const callApiCalls = jest.mocked(providerWithSessionId.callApi).mock.calls;
      expect(callApiCalls.length).toBe(2);

      // First turn: should send system + user (no sessionId yet)
      const firstCall = callApiCalls[0];
      const firstPrompt = JSON.parse(firstCall[0] as string);
      expect(firstPrompt).toHaveLength(2);
      expect(firstPrompt[0]).toEqual({ role: 'system', content: assistantPrompt });
      expect(firstPrompt[1]).toEqual({ role: 'user', content: 'user response' });

      // Second turn: should send only user (sessionId exists)
      const secondCall = callApiCalls[1];
      const secondPrompt = JSON.parse(secondCall[0] as string);
      expect(secondPrompt).toHaveLength(1);
      expect(secondPrompt[0]).toEqual({ role: 'user', content: 'user response' });
    });
  });
});
