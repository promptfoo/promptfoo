import { SimulatedUser } from '../../src/providers/simulatedUser';
import type { ApiProvider, ProviderResponse } from '../../src/types';

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
      delay: 10,
    };

    simulatedUser = new SimulatedUser({
      id: 'test-agent',
      config: {
        instructions: 'test instructions',
        maxTurns: 2,
      },
    });
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
      expect(originalProvider.callApi).toHaveBeenCalledWith(expect.any(String));
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
      expect(originalProvider.callApi).toHaveBeenCalledWith(expect.any(String));
    });

    it('should stop conversation when ###STOP### is received', async () => {
      const providerWithStop: ApiProvider = {
        id: () => 'test-agent',
        callApi: jest.fn().mockImplementation(
          async (): Promise<ProviderResponse> => ({
            output: 'stopping now ###STOP###',
            tokenUsage: { numRequests: 1 },
          }),
        ),
      };

      const result = await simulatedUser.callApi('test prompt', {
        originalProvider: providerWithStop,
        vars: { instructions: 'test instructions' },
        prompt: { raw: 'test', display: 'test', label: 'test' },
      });

      expect(result.output).toContain('###STOP###');
      expect(providerWithStop.callApi).toHaveBeenCalledWith(expect.any(String));
    });

    it('should throw error if originalProvider is not provided', async () => {
      await expect(
        simulatedUser.callApi('test', {
          vars: {},
          prompt: { raw: 'test', display: 'test', label: 'test' },
        }),
      ).rejects.toThrow('Expected originalProvider to be set');
    });

    it('should handle provider delay', async () => {
      const result = await simulatedUser.callApi(
        'test prompt',
        {
          originalProvider,
          vars: { instructions: 'test instructions' },
          prompt: { raw: 'test', display: 'test', label: 'test' },
        },
        { includeLogProbs: false },
      );

      expect(result.output).toBeDefined();
      expect(originalProvider.callApi).toHaveBeenCalledWith(expect.any(String));
    }, 15000); // Increased timeout for test involving delays
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      expect(simulatedUser.toString()).toBe('AgentProvider');
    });
  });
});
