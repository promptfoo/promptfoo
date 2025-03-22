import { PromptfooSimulatedUserProvider } from '../../src/providers/promptfoo';
import { SimulatedUser } from '../../src/providers/simulatedUser';
import type { Message } from '../../src/providers/simulatedUser';
import type { ApiProvider } from '../../src/types';
import * as timeUtils from '../../src/util/time';

jest.mock('../../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/fetch');

jest.mock('../../src/providers/promptfoo', () => ({
  PromptfooSimulatedUserProvider: jest.fn().mockImplementation(() => ({
    id: () => 'test-user',
    callApi: jest.fn().mockResolvedValue({ output: 'user response' }),
  })) as any,
}));

describe('SimulatedUser', () => {
  let simulatedUser: SimulatedUser;
  let originalProvider: ApiProvider;

  beforeEach(() => {
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

  describe('sendMessageToUser', () => {
    it('should flip message roles and call user provider', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];

      const userProvider = new PromptfooSimulatedUserProvider();

      // @ts-ignore - Private method test
      const result = await simulatedUser.sendMessageToUser(messages, userProvider);

      expect(result).toEqual([...messages, { role: 'user', content: 'user response' }]);
    });

    it('should handle empty messages array', async () => {
      const messages: Message[] = [];
      const userProvider = new PromptfooSimulatedUserProvider();

      // @ts-ignore - Private method test
      const result = await simulatedUser.sendMessageToUser(messages, userProvider);

      expect(result).toEqual([{ role: 'user', content: 'user response' }]);
    });
  });

  describe('sendMessageToAgent', () => {
    it('should send messages to agent and handle delay', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];

      const agentProvider = {
        ...originalProvider,
        delay: 100,
      };

      // @ts-ignore - Private method test
      const result = await simulatedUser.sendMessageToAgent(messages, agentProvider, 'test prompt');

      expect(result).toEqual([...messages, { role: 'assistant', content: 'agent response' }]);
      expect(timeUtils.sleep).toHaveBeenCalledWith(100);
    });

    it('should not call sleep if no delay specified', async () => {
      const messages: Message[] = [{ role: 'user', content: 'hello' }];

      // @ts-ignore - Private method test
      await simulatedUser.sendMessageToAgent(messages, originalProvider, 'test prompt');

      expect(timeUtils.sleep).not.toHaveBeenCalled();
    });
  });

  describe('callApi()', () => {
    it('should simulate conversation between user and agent', async () => {
      const result = await simulatedUser.callApi('test prompt', {
        originalProvider,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      } as any);

      expect(result.output).toBeDefined();
      expect(result.output).toContain('User:');
      expect(result.output).toContain('Assistant:');
      expect(result.tokenUsage?.numRequests).toBe(2);
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
      } as any);

      expect(result.output).toBeDefined();
      expect(result.output.split('---')).toHaveLength(2);
    });

    it('should throw error if originalProvider is not provided', async () => {
      await expect(
        simulatedUser.callApi('test', {
          vars: {},
          prompt: { raw: 'test', display: 'test', label: 'test' },
        } as any),
      ).rejects.toThrow('Expected originalProvider to be set');
    });
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      expect(simulatedUser.toString()).toBe('AgentProvider');
    });
  });
});
