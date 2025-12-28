import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsHistoryProvider } from '../../../../src/providers/elevenlabs/history';

import type { CallApiContextParams } from '../../../../src/types/providers';

// Mock dependencies
vi.mock('../../../../src/providers/elevenlabs/client');

describe('ElevenLabsHistoryProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe('constructor', () => {
    it('should create provider with default configuration', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      expect(provider).toBeDefined();
      expect(provider.id()).toBe('elevenlabs:history');
    });

    it('should throw error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsHistoryProvider('elevenlabs:history')).toThrow(
        'ELEVENLABS_API_KEY environment variable is not set',
      );
    });

    it('should use custom configuration', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: {
          agentId: 'test-agent-123',
          timeout: 60000,
        },
      });

      expect(provider.config.agentId).toBe('test-agent-123');
      expect(provider.config.timeout).toBe(60000);
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        label: 'Custom History Label',
      });

      expect(provider.id()).toBe('Custom History Label');
    });
  });

  describe('id()', () => {
    it('should return correct provider ID', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      expect(provider.id()).toBe('elevenlabs:history');
    });
  });

  describe('toString()', () => {
    it('should return human-readable string', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');
      const str = provider.toString();

      expect(str).toContain('ElevenLabs History Provider');
    });

    it('should include agent ID if configured', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { agentId: 'test-agent' },
      });
      const str = provider.toString();

      expect(str).toContain('test-agent');
    });
  });

  describe('API key resolution', () => {
    it('should use config API key over environment variable', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { apiKey: 'config-key' },
      });

      expect(provider).toBeDefined();
    });

    it('should use environment variable when config key not provided', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      expect(provider).toBeDefined();
    });

    it('should support custom API key environment variable', () => {
      process.env.CUSTOM_ELEVENLABS_KEY = 'custom-key';

      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { apiKeyEnvar: 'CUSTOM_ELEVENLABS_KEY' },
      });

      expect(provider).toBeDefined();

      delete process.env.CUSTOM_ELEVENLABS_KEY;
    });
  });

  describe('callApi - single conversation retrieval', () => {
    it('should retrieve specific conversation by ID', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      const mockConversation = {
        conversation_id: 'conv-123',
        agent_id: 'agent-456',
        status: 'completed',
        duration_seconds: 120,
        history: [
          { role: 'agent', message: 'Hello' },
          { role: 'user', message: 'Hi' },
        ],
      };

      (provider as any).client.get = vi.fn().mockResolvedValue(mockConversation);

      const response = await provider.callApi('conv-123');

      expect(response.output).toBeDefined();
      expect(response.error).toBeUndefined();
      expect(response.metadata).toMatchObject({
        conversationId: 'conv-123',
        agentId: 'agent-456',
        status: 'completed',
        duration: 120,
        turnCount: 2,
        latency: expect.any(Number),
      });
    });

    it('should retrieve conversation from context vars', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      const mockConversation = {
        conversation_id: 'conv-456',
        agent_id: 'agent-123',
        status: 'completed',
        duration_seconds: 60,
        history: [],
      };

      (provider as any).client.get = vi.fn().mockResolvedValue(mockConversation);

      const response = await provider.callApi('', {
        vars: { conversationId: 'conv-456' },
      } as unknown as CallApiContextParams);

      expect(response.error).toBeUndefined();
      expect(response.metadata?.conversationId).toBe('conv-456');
    });

    it('should handle API errors when retrieving conversation', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      (provider as any).client.get = vi.fn().mockRejectedValue(new Error('Not found'));

      const response = await provider.callApi('conv-999');

      expect(response.error).toContain('Failed to retrieve conversation');
    });
  });

  describe('callApi - list conversations', () => {
    it('should require agent ID to list conversations', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      const response = await provider.callApi('*');

      expect(response.error).toContain('Agent ID is required');
    });

    it('should list conversations for configured agent', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { agentId: 'agent-123' },
      });

      const mockResponse = {
        conversations: [
          {
            conversation_id: 'conv-1',
            agent_id: 'agent-123',
            status: 'completed',
            duration_seconds: 120,
            history: [{ role: 'agent', message: 'Hello' }],
            created_at: '2024-01-01T00:00:00Z',
          },
          {
            conversation_id: 'conv-2',
            agent_id: 'agent-123',
            status: 'failed',
            duration_seconds: 30,
            history: [],
            created_at: '2024-01-02T00:00:00Z',
          },
        ],
      };

      (provider as any).client.get = vi.fn().mockResolvedValue(mockResponse);

      const response = await provider.callApi('');

      expect(response.error).toBeUndefined();
      expect(response.metadata).toMatchObject({
        agentId: 'agent-123',
        conversationCount: 2,
        latency: expect.any(Number),
      });
    });

    it('should list conversations for agent from context vars', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      const mockResponse = {
        conversations: [
          {
            conversation_id: 'conv-1',
            agent_id: 'agent-456',
            status: 'completed',
            duration_seconds: 90,
            history: [],
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      (provider as any).client.get = vi.fn().mockResolvedValue(mockResponse);

      const response = await provider.callApi('', {
        vars: { agentId: 'agent-456' },
      } as unknown as CallApiContextParams);

      expect(response.error).toBeUndefined();
      expect(response.metadata?.agentId).toBe('agent-456');
      expect(response.metadata?.conversationCount).toBe(1);
    });

    it('should support filtering conversations by status', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { agentId: 'agent-123' },
      });

      const mockResponse = { conversations: [] };

      (provider as any).client.get = vi.fn().mockResolvedValue(mockResponse);

      await provider.callApi('', {
        vars: { status: 'completed' },
      } as unknown as CallApiContextParams);

      expect((provider as any).client.get).toHaveBeenCalledWith(
        expect.stringContaining('status=completed'),
      );
    });

    it('should support filtering conversations by date range', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { agentId: 'agent-123' },
      });

      const mockResponse = { conversations: [] };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (provider as any).client.get = mockGet;

      await provider.callApi('', {
        vars: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      } as unknown as CallApiContextParams);

      const callArg = mockGet.mock.calls[0][0];
      expect(callArg).toContain('start_date=2024-01-01');
      expect(callArg).toContain('end_date=2024-01-31');
    });

    it('should handle API errors when listing conversations', async () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { agentId: 'agent-123' },
      });

      (provider as any).client.get = vi.fn().mockRejectedValue(new Error('API Error'));

      const response = await provider.callApi('');

      expect(response.error).toContain('Failed to list conversations');
    });
  });

  describe('error handling', () => {
    it('should throw meaningful error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsHistoryProvider('elevenlabs:history')).toThrow(
        /ELEVENLABS_API_KEY/i,
      );
    });

    it('should handle invalid configuration gracefully', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: {
          timeout: -1, // Invalid timeout
        },
      });

      expect(provider).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use default timeout if not specified', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history');

      expect(provider.config.timeout).toBe(30000);
    });

    it('should use custom timeout if specified', () => {
      const provider = new ElevenLabsHistoryProvider('elevenlabs:history', {
        config: { timeout: 60000 },
      });

      expect(provider.config.timeout).toBe(60000);
    });
  });
});
