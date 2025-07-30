import { SimulatedUser } from '../../src/providers/simulatedUser';
import * as timeUtils from '../../src/util/time';

import type { ApiProvider } from '../../src/types';

jest.mock('../../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/fetch');

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
        expect.stringContaining('[{"role":"user","content":"user response"}'),
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
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      expect(simulatedUser.toString()).toBe('AgentProvider');
    });
  });
});
