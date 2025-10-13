import { AzureFoundryAssistantProvider } from '../../../src/providers/azure/foundry-assistant';

jest.mock('../../../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock Azure AI Projects SDK
const mockAgent = { id: 'test-agent', name: 'Test Agent' };
const mockThread = { id: 'thread-123' };
const mockMessage = { id: 'message-123' };
const mockRunCompleted = { id: 'run-123', status: 'completed' };

const mockClient = {
  agents: {
    getAgent: jest.fn().mockResolvedValue(mockAgent),
    threads: {
      create: jest.fn().mockResolvedValue(mockThread),
    },
    messages: {
      create: jest.fn().mockResolvedValue(mockMessage),
      list: jest.fn().mockReturnValue({
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
      create: jest.fn().mockResolvedValue(mockRunCompleted),
      get: jest.fn().mockResolvedValue(mockRunCompleted),
      submitToolOutputs: jest.fn().mockResolvedValue(mockRunCompleted),
    },
  },
};

jest.mock('@azure/ai-projects', () => ({
  AIProjectClient: jest.fn().mockImplementation(() => mockClient),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}));

describe('Azure Foundry Assistant Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('instantiation', () => {
    it('should create provider with minimal config', () => {
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
        },
      });

      expect(provider).toBeDefined();
      expect(provider.deploymentName).toBe('test-assistant');
    });

    it('should throw error if projectUrl is not provided', () => {
      expect(() => {
        new AzureFoundryAssistantProvider('test-assistant', {
          config: {},
        });
      }).toThrow('Azure AI Project URL must be provided');
    });

    it('should accept projectUrl from environment variable', () => {
      process.env.AZURE_AI_PROJECT_URL = 'https://env.services.ai.azure.com/api/projects/test';

      const provider = new AzureFoundryAssistantProvider('test-assistant', {
        config: {},
      });

      expect(provider).toBeDefined();
      delete process.env.AZURE_AI_PROJECT_URL;
    });
  });

  describe('run options parameters', () => {
    it('should pass max_tokens to run options', async () => {
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
        },
      });

      await provider.callApi('test prompt');

      expect(mockClient.agents.getAgent).toHaveBeenCalledWith('test-assistant');
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
      const provider = new AzureFoundryAssistantProvider('test-assistant', {
        config: {
          projectUrl: 'https://test.services.ai.azure.com/api/projects/test-project',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toContain('[Assistant] Test response');
    });
  });
});
