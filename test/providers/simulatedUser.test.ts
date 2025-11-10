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

  describe('initialMessages', () => {
    it('should start conversation with vars.initialMessages', async () => {
      const initialMessages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('Hello');
      expect(result.output).toContain('Hi there!');
    });

    it('should start conversation with config.initialMessages', async () => {
      const initialMessages = [
        { role: 'user' as const, content: 'Need help' },
        { role: 'assistant' as const, content: 'Sure, how can I help?' },
      ];

      const userWithConfigInitial = new SimulatedUser({
        config: {
          instructions: 'test instructions',
          maxTurns: 2,
          initialMessages,
        },
      });

      const result = await userWithConfigInitial.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('Need help');
      expect(result.output).toContain('Sure, how can I help?');
    });

    it('should prioritize vars.initialMessages over config.initialMessages', async () => {
      const configInitialMessages = [
        { role: 'user' as const, content: 'Config message' },
        { role: 'assistant' as const, content: 'Config response' },
      ];

      const varsInitialMessages = [
        { role: 'user' as const, content: 'Vars message' },
        { role: 'assistant' as const, content: 'Vars response' },
      ];

      const userWithBoth = new SimulatedUser({
        config: {
          instructions: 'test instructions',
          maxTurns: 2,
          initialMessages: configInitialMessages,
        },
      });

      const result = await userWithBoth.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: varsInitialMessages,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('Vars message');
      expect(result.output).toContain('Vars response');
      expect(result.output).not.toContain('Config message');
      expect(result.output).not.toContain('Config response');
    });

    it('should work without initial messages (backwards compatibility)', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBe(2);
    });

    it('should pass initial messages to user provider in flipped format', async () => {
      const initialMessages = [
        { role: 'user' as const, content: 'User says hello' },
        { role: 'assistant' as const, content: 'Assistant responds' },
      ];

      await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      // Check that sendMessageToUser was called with initial messages included
      const userProviderCalls = mockUserProviderCallApi.mock.calls;
      expect(userProviderCalls.length).toBeGreaterThan(0);

      // First call should include the initial messages (flipped)
      const firstCallArg = JSON.parse(userProviderCalls[0][0]);
      expect(firstCallArg).toContainEqual({
        role: 'assistant', // Flipped from 'user'
        content: 'User says hello',
      });
      expect(firstCallArg).toContainEqual({
        role: 'user', // Flipped from 'assistant'
        content: 'Assistant responds',
      });
    });

    it('should handle stringified JSON array for initialMessages', async () => {
      const stringifiedMessages = JSON.stringify([
        { role: 'user', content: 'Hello from JSON' },
        { role: 'assistant', content: 'Response from JSON' },
      ]);

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: stringifiedMessages,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('Hello from JSON');
      expect(result.output).toContain('Response from JSON');
    });

    it('should skip invalid messages and continue with valid ones', async () => {
      const mixedMessages = [
        { role: 'user', content: 'Valid message' },
        { foo: 'bar' }, // Invalid: missing role and content
        { role: 'assistant', content: 'Another valid message' },
        { role: 'user' }, // Invalid: missing content
        { role: 'invalid-role', content: 'Bad role' }, // Invalid: bad role
      ];

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: mixedMessages as any,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('Valid message');
      expect(result.output).toContain('Another valid message');
      // Invalid messages should be skipped
      expect(result.output).not.toContain('foo');
      expect(result.output).not.toContain('bar');
    });

    it('should return empty array for malformed JSON string', async () => {
      const malformedJson = '{ not valid json [';

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: malformedJson,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      // Should proceed without initial messages
      expect(result.output).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBe(2); // Standard 2 turns without initial messages
    });

    it('should return empty array for non-array JSON', async () => {
      const nonArrayJson = JSON.stringify({ role: 'user', content: 'Not an array' });

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: nonArrayJson,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      // Should proceed without initial messages
      expect(result.output).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBe(2);
    });

    it('should handle empty string initialMessages', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: '',
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      // Empty string should be treated as no initial messages
      expect(result.output).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBe(2);
    });

    it('should validate message content is a string', async () => {
      const invalidMessages = [
        { role: 'user', content: 123 }, // content is not a string
        { role: 'assistant', content: 'Valid message' },
      ];

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: invalidMessages as any,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      // Should only include the valid message
      expect(result.output).toContain('Valid message');
      expect(result.output).not.toContain('123');
    });

    it('should handle initialMessages ending with user role correctly', async () => {
      // This is the documented example case - initial messages end with user message
      // The agent should respond first to avoid consecutive user messages
      const initialMessages = [
        { role: 'user' as const, content: 'I need a flight from NYC to Seattle' },
        { role: 'assistant' as const, content: 'I found a direct flight for $325. Book it?' },
        { role: 'user' as const, content: 'Yes, that works for me' },
      ];

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages,
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();

      // Verify initial messages are included
      expect(result.output).toContain('I need a flight from NYC to Seattle');
      expect(result.output).toContain('I found a direct flight for $325');
      expect(result.output).toContain('Yes, that works for me');

      // Verify the agent was called to respond to the last user message
      expect(originalProvider.callApi).toHaveBeenCalled();

      // The first call to the agent should include all 3 initial messages
      const firstAgentCall = jest.mocked(originalProvider.callApi).mock.calls[0];
      const firstAgentPrompt = JSON.parse(firstAgentCall[0] as string);

      // Should contain system prompt + all 3 initial messages
      expect(firstAgentPrompt).toContainEqual({
        role: 'user',
        content: 'I need a flight from NYC to Seattle',
      });
      expect(firstAgentPrompt).toContainEqual({
        role: 'assistant',
        content: 'I found a direct flight for $325. Book it?',
      });
      expect(firstAgentPrompt).toContainEqual({ role: 'user', content: 'Yes, that works for me' });
    });

    it('should load initialMessages from JSON file', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: 'file://./test/fixtures/initialMessages.json',
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('I need a flight from New York to Seattle');
      expect(result.output).toContain('I can help with that! What date?');
    });

    it('should load initialMessages from YAML file', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: 'file://./test/fixtures/initialMessages.yaml',
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('Hello, I need assistance');
      expect(result.output).toContain("Hi! I'm here to help");
    });

    it('should handle file loading errors gracefully', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: {
          instructions: 'test instructions',
          initialMessages: 'file://./test/fixtures/nonexistent.json',
        },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      // Should proceed without initial messages when file fails to load
      expect(result.output).toBeDefined();
      expect(result.tokenUsage?.numRequests).toBe(2); // Standard 2 turns
    });
  });
});
