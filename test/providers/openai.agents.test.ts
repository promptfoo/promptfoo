import { jest } from '@jest/globals';
import type { Agent } from '@openai/agents';
import * as agents from '@openai/agents';
import * as esmModule from '../../src/esm';
import { OpenAiAgentsProvider } from '../../src/providers/openai/agents';

// Mock dependencies
jest.mock('@openai/agents', () => ({
  run: jest.fn(),
  getOrCreateTrace: jest.fn((fn: () => any) => fn()), // Pass through by default
  startTraceExportLoop: jest.fn(),
  addTraceProcessor: jest.fn(),
  BatchTraceProcessor: jest.fn(),
}));

jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../src/providers/openai/agents-tracing', () => ({
  OTLPTracingExporter: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../src/cache', () => ({
  getCache: jest.fn(() =>
    Promise.resolve({
      get: jest.fn(() => Promise.resolve(null)),
      set: jest.fn(),
    }),
  ),
  isCacheEnabled: jest.fn(() => false),
}));

describe('OpenAiAgentsProvider', () => {
  // Get mocks after jest.mock() has been processed
  let importModule: jest.MockedFunction<typeof import('../../src/esm').importModule>;
  let agentsRun: jest.MockedFunction<typeof import('@openai/agents').run>;
  let getOrCreateTrace: jest.MockedFunction<typeof import('@openai/agents').getOrCreateTrace>;
  let startTraceExportLoop: jest.MockedFunction<typeof import('@openai/agents').startTraceExportLoop>;

  beforeAll(() => {
    const esm = require('../../src/esm');
    const agentsModule = require('@openai/agents');
    importModule = esm.importModule as any;
    agentsRun = agentsModule.run as any;
    getOrCreateTrace = agentsModule.getOrCreateTrace as any;
    startTraceExportLoop = agentsModule.startTraceExportLoop as any;
  });

  const mockAgent: Agent<any, any> = {
    name: 'Test Agent',
    instructions: 'Test instructions',
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock implementations
    importModule.mockResolvedValue({ default: mockAgent });
    agentsRun.mockResolvedValue({
      finalOutput: 'Test response',
      newItems: [],
      usage: {
        totalTokens: 100,
        promptTokens: 50,
        completionTokens: 50,
      },
    } as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with default options', () => {
      const provider = new OpenAiAgentsProvider('test-agent');
      expect(provider.id()).toBe('openai:agents:test-agent');
    });

    it('should create provider with custom config', () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: 'file://./agent.ts',
          maxTurns: 20,
          tracing: true,
        },
      });
      expect(provider['agentConfig']).toMatchObject({
        agent: 'file://./agent.ts',
        maxTurns: 20,
        tracing: true,
      });
    });

    it('should use custom ID if provided', () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        id: 'custom-agent-id',
      });
      expect(provider.id()).toBe('custom-agent-id');
    });
  });

  describe('callApi', () => {
    it('should call agent and return response', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result).toMatchObject({
        output: 'Test response',
        tokenUsage: {
          total: 100,
          prompt: 50,
          completion: 50,
        },
        cached: false,
      });
      expect(agents.run).toHaveBeenCalledWith(
        mockAgent,
        'Test prompt',
        expect.objectContaining({
          maxTurns: 10,
        }),
      );
    });

    it('should load agent on first call', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: 'file://./agent.ts',
        },
      });

      await provider.callApi('Test prompt');

      expect(esmModule.importModule).toHaveBeenCalled();
      expect(esmModule.importModule).toHaveBeenCalledWith(expect.stringContaining('agent.ts'));
    });

    it('should not reload agent on subsequent calls', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: 'file://./agent.ts',
        },
      });

      await provider.callApi('Test prompt 1');
      await provider.callApi('Test prompt 2');

      // Should only load once
      expect(esmModule.importModule).toHaveBeenCalledTimes(1);
    });

    it('should load tools if specified', async () => {
      const mockTools = [
        {
          name: 'test_tool',
          description: 'Test tool',
          parameters: {},
          execute: async () => ({}),
        },
      ];
      importModule.mockResolvedValue(mockTools);

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          tools: 'file://./tools.ts',
        },
      });

      await provider.callApi('Test prompt');

      expect(esmModule.importModule).toHaveBeenCalledWith(expect.stringContaining('tools.ts'));
    });

    it('should load handoffs if specified', async () => {
      const mockHandoffs = [
        {
          agent: mockAgent,
          description: 'Handoff to agent',
        },
      ];
      importModule.mockResolvedValue(mockHandoffs);

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          handoffs: 'file://./handoffs.ts',
        },
      });

      await provider.callApi('Test prompt');

      expect(esmModule.importModule).toHaveBeenCalledWith(expect.stringContaining('handoffs.ts'));
    });

    it('should pass maxTurns to agent run', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          maxTurns: 25,
        },
      });

      await provider.callApi('Test prompt');

      expect(agents.run).toHaveBeenCalledWith(
        mockAgent,
        'Test prompt',
        expect.objectContaining({
          maxTurns: 25,
        }),
      );
    });

    it('should pass context vars to agent run', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      await provider.callApi('Test prompt', {
        vars: { city: 'Tokyo', temperature: '20' },
        prompt: {} as any,
      });

      expect(agents.run).toHaveBeenCalledWith(
        mockAgent,
        'Test prompt',
        expect.objectContaining({
          context: { city: 'Tokyo', temperature: '20' },
        }),
      );
    });

    it('should pass abort signal to agent run', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      const abortController = new AbortController();
      await provider.callApi('Test prompt', undefined, {
        abortSignal: abortController.signal,
      });

      expect(agents.run).toHaveBeenCalledWith(
        mockAgent,
        'Test prompt',
        expect.objectContaining({
          signal: abortController.signal,
        }),
      );
    });

    it('should override model if specified in config', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          model: 'gpt-5-turbo',
        },
      });

      await provider.callApi('Test prompt');

      expect(agents.run).toHaveBeenCalledWith(
        mockAgent,
        'Test prompt',
        expect.objectContaining({
          model: 'gpt-5-turbo',
        }),
      );
    });

    it('should pass model settings if specified', async () => {
      const modelSettings = {
        temperature: 0.7,
        topP: 0.9,
      };

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          modelSettings,
        },
      });

      await provider.callApi('Test prompt');

      expect(agents.run).toHaveBeenCalledWith(
        mockAgent,
        'Test prompt',
        expect.objectContaining({
          modelSettings,
        }),
      );
    });

    it('should wrap run in trace context', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      await provider.callApi('Test prompt');

      expect(agents.getOrCreateTrace).toHaveBeenCalled();
    });

    it('should handle agent run errors', async () => {
      agentsRun.mockRejectedValue(new Error('Agent run failed'));

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      await expect(provider.callApi('Test prompt')).rejects.toThrow('Agent run failed');
    });

    it('should handle missing agent configuration', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {},
      });

      await expect(provider.callApi('Test prompt')).rejects.toThrow(
        'No agent configuration provided',
      );
    });

    it('should extract token usage from result', async () => {
      agentsRun.mockResolvedValue({
        finalOutput: 'Response',
        usage: {
          totalTokens: 200,
          promptTokens: 100,
          completionTokens: 100,
        },
      } as any);

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.tokenUsage).toEqual({
        total: 200,
        prompt: 100,
        completion: 100,
      });
    });

    it('should handle missing token usage', async () => {
      agentsRun.mockResolvedValue({
        finalOutput: 'Response',
        usage: undefined,
      } as any);

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.tokenUsage).toEqual({});
    });
  });

  describe('tracing', () => {
    it('should setup tracing when enabled in config', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          tracing: true,
        },
      });

      await provider.callApi('Test prompt');

      expect(agents.startTraceExportLoop).toHaveBeenCalled();
    });

    it('should setup tracing when enabled in test metadata', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      await provider.callApi('Test prompt', {
        test: {
          metadata: {
            tracingEnabled: true,
          },
        },
      } as any);

      expect(agents.startTraceExportLoop).toHaveBeenCalled();
    });

    it('should setup tracing when PROMPTFOO_TRACING_ENABLED is set', async () => {
      process.env.PROMPTFOO_TRACING_ENABLED = 'true';

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
        },
      });

      await provider.callApi('Test prompt');

      expect(agents.startTraceExportLoop).toHaveBeenCalled();

      delete process.env.PROMPTFOO_TRACING_ENABLED;
    });

    it('should not setup tracing when disabled', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          tracing: false,
        },
      });

      await provider.callApi('Test prompt');

      expect(agents.startTraceExportLoop).not.toHaveBeenCalled();
    });

    it('should not fail if tracing setup fails', async () => {
      startTraceExportLoop.mockImplementation(() => {
        throw new Error('Tracing failed');
      });

      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: mockAgent,
          tracing: true,
        },
      });

      // Should not throw - tracing failure should not block execution
      await expect(provider.callApi('Test prompt')).resolves.toBeDefined();
    });
  });

  describe('toString', () => {
    it('should return formatted string', () => {
      const provider = new OpenAiAgentsProvider('test-agent');
      expect(provider.toString()).toBe('[OpenAI Agents Provider test-agent]');
    });
  });
});
