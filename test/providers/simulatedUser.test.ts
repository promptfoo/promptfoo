import { jest } from '@jest/globals';
import { PromptfooSimulatedUserProvider } from '../../src/providers/promptfoo';
import { SimulatedUser } from '../../src/providers/simulatedUser';
import type { ApiProvider, CallApiContextParams, ProviderResponse, Prompt } from '../../src/types';
import { getNunjucksEngine } from '../../src/util/templates';

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/util/templates', () => ({
  getNunjucksEngine: jest.fn(),
}));

describe('SimulatedUser', () => {
  let simulatedUser: SimulatedUser;
  let mockOriginalProvider: ApiProvider;
  let mockNunjucksEngine: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOriginalProvider = {
      id: jest.fn(() => 'mockAgent'),
      // @ts-ignore
      callApi: jest.fn().mockResolvedValue({
        output: 'agent response',
        tokenUsage: { numRequests: 1 },
      } as ProviderResponse),
      delay: 0,
    } as ApiProvider;

    mockNunjucksEngine = {
      renderString: jest.fn(() => 'rendered instructions'),
    };
    jest.mocked(getNunjucksEngine).mockReturnValue(mockNunjucksEngine);

    jest.spyOn(PromptfooSimulatedUserProvider.prototype, 'callApi').mockResolvedValue({
      output: 'user response',
    } as ProviderResponse);

    simulatedUser = new SimulatedUser({
      id: 'test-agent',
      config: {
        instructions: 'test instructions',
        maxTurns: 2,
      },
    });
  });

  describe('id()', () => {
    it.skip('should return the identifier', () => {
      expect(simulatedUser.id()).toBe('test-agent');
    });

    it.skip('should use label if id is not provided', () => {
      const user = new SimulatedUser({
        label: 'test-label',
        config: {},
      });
      expect(user.id()).toBe('test-label');
    });

    it.skip('should use default identifier when neither id nor label is provided', () => {
      const user = new SimulatedUser({
        config: {},
      });
      expect(user.id()).toBe('agent-provider');
    });
  });

  describe('callApi()', () => {
    const defaultContext: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: {},
      prompt: { raw: 'test prompt', label: 'test-label' } as Prompt,
    };

    it.skip('should handle conversation flow between user and agent', async () => {
      const result = await simulatedUser.callApi('initial prompt', defaultContext);

      expect(result.output).toContain('User: user response');
      expect(result.output).toContain('Assistant: agent response');
      expect(result.tokenUsage).toEqual({ numRequests: 1 });
      expect(mockOriginalProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it.skip('should stop conversation when ###STOP### is received', async () => {
      const mockStopResponse: ProviderResponse = {
        output: '###STOP###',
      };
      jest.spyOn(mockOriginalProvider, 'callApi').mockResolvedValueOnce(mockStopResponse);

      const result = await simulatedUser.callApi('initial prompt', defaultContext);

      expect(result.output).toContain('###STOP###');
      expect(mockOriginalProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it.skip('should limit conversation to maxTurns', async () => {
      const limitedUser = new SimulatedUser({
        id: 'test-limited-agent',
        config: {
          instructions: 'test instructions',
          maxTurns: 1,
        },
      });

      await limitedUser.callApi('initial prompt', defaultContext);

      expect(mockOriginalProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it.skip('should throw an error if originalProvider is not provided', async () => {
      const invalidContext = {
        vars: {},
        prompt: { raw: 'test prompt', label: 'test-label' } as Prompt,
      } as unknown as CallApiContextParams;

      await expect(simulatedUser.callApi('initial prompt', invalidContext)).rejects.toThrow(
        'Expected originalProvider to be set',
      );
    });
  });

  describe('toString()', () => {
    it.skip('should return provider name as AgentProvider', () => {
      expect(simulatedUser.toString()).toBe('AgentProvider');
    });
  });
});
