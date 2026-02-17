import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopilotAgentProvider } from '../../src/providers/copilot-agent';

// Hoisted mocks using function expressions (not arrow functions) for constructor compatibility
const mockGetToken = vi.hoisted(() => vi.fn());
const mockStartConversationStreaming = vi.hoisted(() => vi.fn());
const mockSendActivityStreaming = vi.hoisted(() => vi.fn());
const mockScopeFromSettings = vi.hoisted(() => vi.fn());

vi.mock('@azure/identity', () => ({
  ClientSecretCredential: class MockClientSecretCredential {
    getToken = mockGetToken;
  },
}));

vi.mock('@microsoft/agents-copilotstudio-client', () => {
  class MockCopilotStudioClient {
    startConversationStreaming = mockStartConversationStreaming;
    sendActivityStreaming = mockSendActivityStreaming;
    static scopeFromSettings = mockScopeFromSettings;
  }
  return { CopilotStudioClient: MockCopilotStudioClient };
});

const mockActivityConstructor = vi.hoisted(() => vi.fn());

vi.mock('@microsoft/agents-activity', () => ({
  Activity: class MockActivity {
    data: any;
    constructor(data: any) {
      mockActivityConstructor(data);
      Object.assign(this, data);
    }
  },
  ActivityTypes: { Message: 'message', Typing: 'typing' },
}));

// Helper to create an async generator from an array
async function* asyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

const defaultConfig = {
  environmentId: 'env-123',
  tenantId: 'tenant-456',
  clientId: 'client-789',
  clientSecret: 'secret-abc',
};

describe('CopilotAgentProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue({ token: 'mock-jwt-token' });
    mockScopeFromSettings.mockReturnValue('https://api.copilot.microsoft.com/.default');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor and id', () => {
    it('should return correct provider ID', () => {
      const provider = new CopilotAgentProvider('hr-assistant');
      expect(provider.id()).toBe('copilot-agent:hr-assistant');
    });

    it('should return correct toString', () => {
      const provider = new CopilotAgentProvider('hr-assistant');
      expect(provider.toString()).toBe('[Copilot Agent Provider: hr-assistant]');
    });
  });

  describe('missing config', () => {
    it('should return error when environmentId is missing', async () => {
      const provider = new CopilotAgentProvider('test-agent', {
        config: { tenantId: 't', clientId: 'c', clientSecret: 's' },
      });
      const result = await provider.callApi('hello');
      expect(result.error).toContain('environmentId');
      expect(result.error).toContain('COPILOT_AGENT_ENVIRONMENT_ID');
    });

    it('should return error when tenantId is missing', async () => {
      const provider = new CopilotAgentProvider('test-agent', {
        config: { environmentId: 'e', clientId: 'c', clientSecret: 's' },
      });
      const result = await provider.callApi('hello');
      expect(result.error).toContain('tenantId');
      expect(result.error).toContain('COPILOT_AGENT_TENANT_ID');
    });

    it('should return error when clientId is missing', async () => {
      const provider = new CopilotAgentProvider('test-agent', {
        config: { environmentId: 'e', tenantId: 't', clientSecret: 's' },
      });
      const result = await provider.callApi('hello');
      expect(result.error).toContain('clientId');
      expect(result.error).toContain('COPILOT_AGENT_CLIENT_ID');
    });

    it('should return error when clientSecret is missing', async () => {
      const provider = new CopilotAgentProvider('test-agent', {
        config: { environmentId: 'e', tenantId: 't', clientId: 'c' },
      });
      const result = await provider.callApi('hello');
      expect(result.error).toContain('clientSecret');
      expect(result.error).toContain('COPILOT_AGENT_CLIENT_SECRET');
    });
  });

  describe('env var fallback', () => {
    it('should use environment variables when config values are missing', async () => {
      process.env.COPILOT_AGENT_ENVIRONMENT_ID = 'env-from-env';
      process.env.COPILOT_AGENT_TENANT_ID = 'tenant-from-env';
      process.env.COPILOT_AGENT_CLIENT_ID = 'client-from-env';
      process.env.COPILOT_AGENT_CLIENT_SECRET = 'secret-from-env';

      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(asyncGenerator([{ type: 'message', text: 'Hi!' }]));

      const provider = new CopilotAgentProvider('test-agent');
      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Hi!');

      delete process.env.COPILOT_AGENT_ENVIRONMENT_ID;
      delete process.env.COPILOT_AGENT_TENANT_ID;
      delete process.env.COPILOT_AGENT_CLIENT_ID;
      delete process.env.COPILOT_AGENT_CLIENT_SECRET;
    });
  });

  describe('callApi success', () => {
    it('should return agent response on success', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(
        asyncGenerator([{ type: 'message', text: 'Hello, how can I help you?' }]),
      );

      const provider = new CopilotAgentProvider('hr-assistant', {
        config: defaultConfig,
      });
      const result = await provider.callApi('What are the holiday policies?');

      expect(result.output).toBe('Hello, how can I help you?');
      expect(result.error).toBeUndefined();
      expect(result.metadata).toHaveProperty('latencyMs');
    });

    it('should use schemaName from config over agent name', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(
        asyncGenerator([{ type: 'message', text: 'Response' }]),
      );

      const provider = new CopilotAgentProvider('my-agent', {
        config: { ...defaultConfig, schemaName: 'custom-schema-name' },
      });
      await provider.callApi('test');

      expect(mockScopeFromSettings).toHaveBeenCalledWith({
        environmentId: 'env-123',
        schemaName: 'custom-schema-name',
      });
    });

    it('should default schemaName to agent name from provider ID', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(
        asyncGenerator([{ type: 'message', text: 'Response' }]),
      );

      const provider = new CopilotAgentProvider('hr-assistant', {
        config: defaultConfig,
      });
      await provider.callApi('test');

      expect(mockScopeFromSettings).toHaveBeenCalledWith({
        environmentId: 'env-123',
        schemaName: 'hr-assistant',
      });
    });

    it('should concatenate multiple response messages', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(
        asyncGenerator([
          { type: 'message', text: 'First part.' },
          { type: 'message', text: 'Second part.' },
        ]),
      );

      const provider = new CopilotAgentProvider('test-agent', {
        config: defaultConfig,
      });
      const result = await provider.callApi('test');

      expect(result.output).toBe('First part.\n\nSecond part.');
    });

    it('should return "(no response)" when no message activities received', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(asyncGenerator([]));

      const provider = new CopilotAgentProvider('test-agent', {
        config: defaultConfig,
      });
      const result = await provider.callApi('test');

      expect(result.output).toBe('(no response)');
    });
  });

  describe('filtering non-message activities', () => {
    it('should filter out typing indicators and events', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(
        asyncGenerator([
          { type: 'typing', text: '' },
          { type: 'message', text: 'Real response' },
          { type: 'event', text: 'some event data' },
          { type: 'message', text: '' },
        ]),
      );

      const provider = new CopilotAgentProvider('test-agent', {
        config: defaultConfig,
      });
      const result = await provider.callApi('test');

      expect(result.output).toBe('Real response');
    });
  });

  describe('authentication failure', () => {
    it('should return error when token acquisition fails', async () => {
      mockGetToken.mockRejectedValue(new Error('Invalid client credentials'));

      const provider = new CopilotAgentProvider('test-agent', {
        config: defaultConfig,
      });
      const result = await provider.callApi('test');

      expect(result.error).toBe('Invalid client credentials');
    });
  });

  describe('timeout', () => {
    it('should handle AbortError as timeout', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockSendActivityStreaming.mockImplementation(function () {
        return (async function* () {
          throw abortError;
        })();
      });

      const provider = new CopilotAgentProvider('test-agent', {
        config: { ...defaultConfig, timeoutMs: 5000 },
      });
      const result = await provider.callApi('test');

      expect(result.error).toContain('timed out');
      expect(result.error).toContain('5000ms');
    });
  });

  describe('message activity creation', () => {
    it('should create message activity with prompt text and userId', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(
        asyncGenerator([{ type: 'message', text: 'Response' }]),
      );

      const provider = new CopilotAgentProvider('test-agent', {
        config: { ...defaultConfig, userId: 'custom-user' },
      });
      await provider.callApi('My prompt text');

      expect(mockActivityConstructor).toHaveBeenCalledWith({
        type: 'message',
        text: 'My prompt text',
        from: { id: 'custom-user', name: 'custom-user' },
      });
    });

    it('should use default userId when not configured', async () => {
      mockStartConversationStreaming.mockReturnValue(asyncGenerator([]));
      mockSendActivityStreaming.mockReturnValue(
        asyncGenerator([{ type: 'message', text: 'Response' }]),
      );

      const provider = new CopilotAgentProvider('test-agent', {
        config: defaultConfig,
      });
      await provider.callApi('test');

      expect(mockActivityConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { id: 'promptfoo-user', name: 'promptfoo-user' },
        }),
      );
    });
  });
});
