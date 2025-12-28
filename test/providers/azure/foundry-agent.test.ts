import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getCache: vi.fn(),
    isCacheEnabled: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../../../src/util/time', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock Azure AI Projects SDK
const mockAgent = { id: 'test-agent', name: 'Test Agent' };
const mockThread = { id: 'thread-123' };
const mockMessage = { id: 'message-123' };
const mockRunCompleted = { id: 'run-123', status: 'completed' };

const mockClient = {
  agents: {
    getAgent: vi.fn().mockResolvedValue(mockAgent),
    threads: {
      create: vi.fn().mockResolvedValue(mockThread),
    },
    messages: {
      create: vi.fn().mockResolvedValue(mockMessage),
      list: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            id: 'msg-1',
            role: 'assistant',
            content: [{ type: 'text', text: { value: 'Test response' } }],
          };
        },
      }),
    },
    runs: {
      create: vi.fn().mockResolvedValue(mockRunCompleted),
      get: vi.fn().mockResolvedValue(mockRunCompleted),
      submitToolOutputs: vi.fn().mockResolvedValue(mockRunCompleted),
    },
  },
};

// Don't mock the Azure packages directly since they're optional dependencies
// Instead, we'll mock the initializeClient method below

describe('Azure Foundry Agent Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AZURE_API_HOST = 'test.azure.com';
    process.env.AZURE_API_KEY = 'test-key';
    vi.spyOn(AzureFoundryAgentProvider.prototype as any, 'ensureInitialized').mockResolvedValue(
      undefined,
    );
    vi.spyOn(AzureFoundryAgentProvider.prototype as any, 'getAuthHeaders').mockResolvedValue({
      'api-key': 'test-key',
    });

    // Mock the initializeClient private method to return our mock client
    vi.spyOn(AzureFoundryAgentProvider.prototype as any, 'initializeClient').mockResolvedValue(
      mockClient,
    );
  });

  afterEach(() => {
    delete process.env.AZURE_API_HOST;
    delete process.env.AZURE_API_KEY;
    vi.restoreAllMocks();
  });

  describe('instantiation', () => {
    it('should create provider with minimal config', () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
        },
      });

      expect(provider).toBeDefined();
      expect(provider.deploymentName).toBe('test-agent');
    });

    it('should throw error if projectUrl is not provided', () => {
      expect(() => {
        new AzureFoundryAgentProvider('test-agent', {
          config: {},
        });
      }).toThrow('Azure AI Project URL must be provided');
    });

    it('should accept projectUrl from environment variable', () => {
      process.env.AZURE_AI_PROJECT_URL = 'https://env.services.ai.azure.com/api/projects/test';

      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {},
      });

      expect(provider).toBeDefined();
      delete process.env.AZURE_AI_PROJECT_URL;
    });
  });

  describe('run options parameters', () => {
    it('should pass max_tokens to run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          max_tokens: 150,
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          max_tokens: 150,
        }),
      );
    });

    it('should pass max_completion_tokens to run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          max_completion_tokens: 200,
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          max_completion_tokens: 200,
        }),
      );
    });

    it('should pass both max_tokens and max_completion_tokens when both are provided', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          max_tokens: 100,
          max_completion_tokens: 200,
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          max_tokens: 100,
          max_completion_tokens: 200,
        }),
      );
    });

    it('should pass frequency_penalty to run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          frequency_penalty: 0.5,
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          frequency_penalty: 0.5,
        }),
      );
    });

    it('should pass presence_penalty to run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          presence_penalty: 0.3,
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          presence_penalty: 0.3,
        }),
      );
    });

    it('should pass response_format to run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          response_format: { type: 'json_object' },
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          response_format: { type: 'json_object' },
        }),
      );
    });

    it('should pass stop sequences to run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          stop: ['END', 'STOP'],
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          stop: ['END', 'STOP'],
        }),
      );
    });

    it('should pass seed to run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          seed: 12345,
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          seed: 12345,
        }),
      );
    });

    it('should pass all parameters together when configured', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          temperature: 0.7,
          max_tokens: 150,
          max_completion_tokens: 200,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          top_p: 0.9,
          stop: ['END'],
          seed: 12345,
          response_format: { type: 'json_object' },
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.objectContaining({
          temperature: 0.7,
          max_tokens: 150,
          max_completion_tokens: 200,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          top_p: 0.9,
          stop: ['END'],
          seed: 12345,
          response_format: { type: 'json_object' },
        }),
      );
    });

    it('should not include undefined parameters in run options', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
          temperature: 0.5,
        },
      });

      await provider.callApi('test prompt');

      const runOptions = mockClient.agents.runs.create.mock.calls[0][2];
      expect(runOptions).toEqual({
        temperature: 0.5,
      });
      expect(runOptions).not.toHaveProperty('max_tokens');
      expect(runOptions).not.toHaveProperty('max_completion_tokens');
      expect(runOptions).not.toHaveProperty('frequency_penalty');
      expect(runOptions).not.toHaveProperty('presence_penalty');
      expect(runOptions).not.toHaveProperty('stop');
      expect(runOptions).not.toHaveProperty('seed');
      expect(runOptions).not.toHaveProperty('response_format');
    });
  });

  describe('basic functionality', () => {
    it('should create thread, message, and run', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.getAgent).toHaveBeenCalledWith('test-agent');
      expect(mockClient.agents.threads.create).toHaveBeenCalled();
      expect(mockClient.agents.messages.create).toHaveBeenCalledWith(
        mockThread.id,
        'user',
        'test prompt',
      );
      expect(mockClient.agents.runs.create).toHaveBeenCalledWith(
        mockThread.id,
        mockAgent.id,
        expect.any(Object),
      );
    });

    it('should return formatted output', async () => {
      const provider = new AzureFoundryAgentProvider('test-agent', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toContain('[Assistant] Test response');
    });
  });
});
