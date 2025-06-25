import { SimulatedUser } from '../../../src/providers/simulatedUser';
import { REDTEAM_SIMULATED_USER_STRATEGY_ID } from '../../../src/redteam/constants/strategies';
import RedteamSimulatedUserProvider from '../../../src/redteam/providers/simulatedUser';
import type { CallApiContextParams, CallApiOptionsParams, Prompt } from '../../../src/types';

jest.mock('../../../src/providers/simulatedUser');

describe('RedteamSimulatedUserProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should create provider with required config', () => {
    const provider = new RedteamSimulatedUserProvider({
      injectVar: 'test_var',
    });
    expect(provider).toBeInstanceOf(RedteamSimulatedUserProvider);
  });

  it('should throw error if injectVar is not set', () => {
    expect(() => {
      new RedteamSimulatedUserProvider({} as any);
    }).toThrow('Expected injectVar to be set');
  });

  it('should return correct id', () => {
    const provider = new RedteamSimulatedUserProvider({
      injectVar: 'test_var',
    });
    expect(provider.id()).toBe(`promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`);
  });

  it('should call SimulatedUser with correct config', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'test response' });
    jest.mocked(SimulatedUser).mockImplementation(function (this: any) {
      this.id = () => 'test-id';
      this.callApi = mockCallApi;
      this.identifier = 'test-id';
      this.maxTurns = 5;
      this.rawInstructions = 'test instructions';
      jest.spyOn(this, 'sendMessageToUser').mockImplementation();
      jest.spyOn(this, 'sendMessageToAgent').mockImplementation();
      return this;
    });

    const provider = new RedteamSimulatedUserProvider({
      injectVar: 'test_var',
      maxTurns: 5,
    });

    const prompt: Prompt = { raw: 'test prompt', display: 'test prompt', label: 'test' };
    const context: CallApiContextParams = {
      prompt,
      vars: { test: 'value' },
      originalProvider: {
        id: () => 'test',
        callApi: async () => ({ output: 'test' }),
      },
    };
    const options: CallApiOptionsParams = {};

    await provider.callApi('test prompt', context, options);

    expect(SimulatedUser).toHaveBeenCalledWith({
      id: `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`,
      config: {
        instructions: '{{test_var}}',
        maxTurns: 5,
        stateful: false,
      },
    });

    expect(mockCallApi).toHaveBeenCalledWith('test prompt', context, options);
  });

  it('should handle undefined maxTurns', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'test response' });
    jest.mocked(SimulatedUser).mockImplementation(function (this: any) {
      this.id = () => 'test-id';
      this.callApi = mockCallApi;
      this.identifier = 'test-id';
      this.maxTurns = 5;
      this.rawInstructions = 'test instructions';
      jest.spyOn(this, 'sendMessageToUser').mockImplementation();
      jest.spyOn(this, 'sendMessageToAgent').mockImplementation();
      return this;
    });

    const provider = new RedteamSimulatedUserProvider({
      injectVar: 'test_var',
    });

    await provider.callApi('test');

    expect(SimulatedUser).toHaveBeenCalledWith({
      id: `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`,
      config: {
        instructions: '{{test_var}}',
        maxTurns: 5,
        stateful: false,
      },
    });
  });

  it('should set stateful to true when configured', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'test response' });
    jest.mocked(SimulatedUser).mockImplementation(function (this: any) {
      this.id = () => 'test-id';
      this.callApi = mockCallApi;
      this.identifier = 'test-id';
      this.maxTurns = 3;
      this.rawInstructions = 'test instructions';
      jest.spyOn(this, 'sendMessageToUser').mockImplementation();
      jest.spyOn(this, 'sendMessageToAgent').mockImplementation();
      return this;
    });

    const provider = new RedteamSimulatedUserProvider({
      injectVar: 'test_var',
      maxTurns: 3,
      stateful: true,
    });

    const prompt: Prompt = { raw: 'test prompt', display: 'test prompt', label: 'test' };
    const context: CallApiContextParams = {
      prompt,
      vars: { test: 'value' },
      originalProvider: {
        id: () => 'test',
        callApi: async () => ({ output: 'test' }),
      },
    };
    const options: CallApiOptionsParams = {};

    await provider.callApi('test prompt', context, options);

    expect(SimulatedUser).toHaveBeenCalledWith({
      id: `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`,
      config: {
        instructions: '{{test_var}}',
        maxTurns: 3,
        stateful: true,
      },
    });
  });

  it('should set stateful to false when explicitly configured', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'test response' });
    jest.mocked(SimulatedUser).mockImplementation(function (this: any) {
      this.id = () => 'test-id';
      this.callApi = mockCallApi;
      this.identifier = 'test-id';
      this.maxTurns = 2;
      this.rawInstructions = 'test instructions';
      jest.spyOn(this, 'sendMessageToUser').mockImplementation();
      jest.spyOn(this, 'sendMessageToAgent').mockImplementation();
      return this;
    });

    const provider = new RedteamSimulatedUserProvider({
      injectVar: 'test_var',
      maxTurns: 2,
      stateful: false,
    });

    const prompt: Prompt = { raw: 'test prompt', display: 'test prompt', label: 'test' };
    const context: CallApiContextParams = {
      prompt,
      vars: { test: 'value' },
      originalProvider: {
        id: () => 'test',
        callApi: async () => ({ output: 'test' }),
      },
    };
    const options: CallApiOptionsParams = {};

    await provider.callApi('test prompt', context, options);

    expect(SimulatedUser).toHaveBeenCalledWith({
      id: `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`,
      config: {
        instructions: '{{test_var}}',
        maxTurns: 2,
        stateful: false,
      },
    });
  });

  it('should default stateful to false when not specified', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'test response' });
    jest.mocked(SimulatedUser).mockImplementation(function (this: any) {
      this.id = () => 'test-id';
      this.callApi = mockCallApi;
      this.identifier = 'test-id';
      this.maxTurns = 5;
      this.rawInstructions = 'test instructions';
      jest.spyOn(this, 'sendMessageToUser').mockImplementation();
      jest.spyOn(this, 'sendMessageToAgent').mockImplementation();
      return this;
    });

    const provider = new RedteamSimulatedUserProvider({
      injectVar: 'test_var',
      maxTurns: 4,
    });

    const prompt: Prompt = { raw: 'test prompt', display: 'test prompt', label: 'test' };
    const context: CallApiContextParams = {
      prompt,
      vars: { test: 'value' },
      originalProvider: {
        id: () => 'test',
        callApi: async () => ({ output: 'test' }),
      },
    };
    const options: CallApiOptionsParams = {};

    await provider.callApi('test prompt', context, options);

    expect(SimulatedUser).toHaveBeenCalledWith({
      id: `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`,
      config: {
        instructions: '{{test_var}}',
        maxTurns: 4,
        stateful: false,
      },
    });
  });
});
