import { SimulatedUser } from '../../src/providers/simulatedUser';
import type { ApiProvider, ProviderResponse } from '../../src/types';
import * as timeUtils from '../../src/util/time';

jest.mock('../../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/fetch');

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
      expect(originalProvider.callApi).toHaveBeenCalledWith(expect.any(String));
      expect(timeUtils.sleep).not.toHaveBeenCalled();
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
      expect(providerWithDelay.callApi).toHaveBeenCalledWith(expect.any(String));
      expect(timeUtils.sleep).toHaveBeenCalledWith(100);
    });
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      expect(simulatedUser.toString()).toBe('AgentProvider');
    });
  });
});
