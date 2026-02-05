import { WebClient } from '@slack/web-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackProvider } from '../src/providers/slack';

import type { ApiProvider } from '../src/types/index';

const slackMocks = vi.hoisted(() => ({
  webClientImpl: vi.fn(),
}));

vi.mock('@slack/web-api', () => {
  const WebClientMock = vi.fn(function WebClientMock(...args: any[]) {
    return slackMocks.webClientImpl(...args);
  });

  return { WebClient: WebClientMock };
});

describe('SlackProvider', () => {
  let mockWebClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

    mockWebClient = {
      chat: {
        postMessage: vi.fn(),
      },
      conversations: {
        history: vi.fn(),
      },
    };

    slackMocks.webClientImpl.mockReturnValue(mockWebClient);
  });

  afterEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
  });

  describe('constructor', () => {
    it('should throw error if no token is provided', () => {
      delete process.env.SLACK_BOT_TOKEN;
      expect(() => new SlackProvider({ config: { channel: 'C123' } })).toThrow(
        'Slack provider requires a token',
      );
    });

    it('should throw error if no channel is provided', () => {
      expect(() => new SlackProvider({ config: { token: 'xoxb-test' } })).toThrow(
        'Slack provider requires a channel ID',
      );
    });

    it('should use token from config over environment variable', () => {
      const provider = new SlackProvider({
        config: {
          token: 'xoxb-config-token',
          channel: 'C123',
        },
      });
      expect(WebClient).toHaveBeenCalledWith('xoxb-config-token');
      expect(provider).toBeDefined();
    });

    it('should use token from environment variable if not in config', () => {
      const provider = new SlackProvider({
        config: {
          channel: 'C123',
        },
      });
      expect(WebClient).toHaveBeenCalledWith('xoxb-test-token');
      expect(provider).toBeDefined();
    });
  });

  describe('id()', () => {
    it('should return default id if not provided', () => {
      const provider = new SlackProvider({ config: { channel: 'C123' } });
      expect(provider.id()).toBe('slack');
    });

    it('should return custom id if provided', () => {
      const provider = new SlackProvider({
        id: 'custom-slack',
        config: { channel: 'C123' },
      });
      expect(provider.id()).toBe('custom-slack');
    });
  });

  describe('callApi()', () => {
    let provider: ApiProvider;

    beforeEach(() => {
      provider = new SlackProvider({
        config: {
          channel: 'C123',
          timeout: 1000,
        },
      });
    });

    it('should post message to Slack and return first response', async () => {
      // Set a longer timeout for this test
      provider = new SlackProvider({
        config: {
          channel: 'C123',
          timeout: 3000,
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      mockWebClient.conversations.history
        .mockResolvedValueOnce({
          messages: [],
        } as any)
        .mockResolvedValueOnce({
          messages: [
            {
              type: 'message',
              ts: '1234567890.123457',
              text: 'Hello from user',
              user: 'U123',
            },
          ],
        } as any);

      const result = await provider.callApi('Test prompt');

      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123',
        text: 'Test prompt',
        thread_ts: undefined,
        mrkdwn: true,
      });

      expect(result.output).toBe('Hello from user');
      expect(result.metadata).toMatchObject({
        messageTs: '1234567890.123456',
        channel: 'C123',
      });
      expect(result.metadata?.responseTime).toBeDefined();
      expect(typeof result.metadata?.responseTime).toBe('number');
    });

    it('should filter out bot messages', async () => {
      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      mockWebClient.conversations.history.mockResolvedValue({
        messages: [
          {
            type: 'message',
            ts: '1234567890.123457',
            text: 'Bot message',
            bot_id: 'B123',
          },
          {
            type: 'message',
            ts: '1234567890.123458',
            text: 'User message',
            user: 'U123',
          },
        ],
      } as any);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('User message');
    });

    it('should handle timeout', async () => {
      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      mockWebClient.conversations.history.mockResolvedValue({
        messages: [],
      } as any);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Timeout waiting for Slack response');
    });

    it('should handle post message failure', async () => {
      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: false,
      } as any);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('Failed to post message to Slack');
    });

    it('should use custom message formatter if provided', async () => {
      provider = new SlackProvider({
        config: {
          channel: 'C123',
          formatMessage: (prompt) => `*Bold prompt:* ${prompt}`,
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      mockWebClient.conversations.history.mockResolvedValue({
        messages: [
          {
            type: 'message',
            ts: '1234567890.123457',
            text: 'Response',
            user: 'U123',
          },
        ],
      } as any);

      await provider.callApi('Test prompt');

      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '*Bold prompt:* Test prompt',
        }),
      );
    });
  });

  describe('response strategies', () => {
    it('should wait for specific user when responseStrategy is "user"', async () => {
      const provider = new SlackProvider({
        config: {
          channel: 'C123',
          responseStrategy: 'user',
          waitForUser: 'U456',
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      mockWebClient.conversations.history
        .mockResolvedValueOnce({
          messages: [
            {
              type: 'message',
              ts: '1234567890.123457',
              text: 'Wrong user',
              user: 'U123',
            },
          ],
        } as any)
        .mockResolvedValueOnce({
          messages: [
            {
              type: 'message',
              ts: '1234567890.123457',
              text: 'Wrong user',
              user: 'U123',
            },
            {
              type: 'message',
              ts: '1234567890.123458',
              text: 'Correct user',
              user: 'U456',
            },
          ],
        } as any);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Correct user');
      expect(result.metadata?.waitForUser).toBe('U456');
    });

    it('should collect all responses until timeout when responseStrategy is "timeout"', async () => {
      const provider = new SlackProvider({
        config: {
          channel: 'C123',
          responseStrategy: 'timeout',
          timeout: 3000, // Increase timeout to ensure reliable polling on all platforms
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      let callCount = 0;
      mockWebClient.conversations.history.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            messages: [
              {
                type: 'message',
                ts: '1234567890.123457',
                text: 'First response',
                user: 'U123',
              },
            ],
          } as any);
        } else {
          return Promise.resolve({
            messages: [
              {
                type: 'message',
                ts: '1234567890.123457',
                text: 'First response',
                user: 'U123',
              },
              {
                type: 'message',
                ts: '1234567890.123458',
                text: 'Second response',
                user: 'U456',
              },
            ],
          } as any);
        }
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('First response\n\nSecond response');
    });

    it('should throw error if waitForUser not specified with user strategy', async () => {
      const provider = new SlackProvider({
        config: {
          channel: 'C123',
          responseStrategy: 'user',
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe(
        'waitForUser must be specified when using "user" response strategy',
      );
    });
  });

  describe('thread support', () => {
    it('should post in thread if threadTs is provided', async () => {
      const provider = new SlackProvider({
        config: {
          channel: 'C123',
          threadTs: '1234567890.000001',
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      mockWebClient.conversations.history.mockResolvedValue({
        messages: [
          {
            type: 'message',
            ts: '1234567890.123457',
            text: 'Response',
            user: 'U123',
          },
        ],
      } as any);

      await provider.callApi('Test prompt');

      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: '1234567890.000001',
        }),
      );
    });

    it('should include thread timestamp in metadata if includeThread is true', async () => {
      const provider = new SlackProvider({
        config: {
          channel: 'C123',
          includeThread: true,
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      } as any);

      mockWebClient.conversations.history.mockResolvedValue({
        messages: [
          {
            type: 'message',
            ts: '1234567890.123457',
            text: 'Response',
            user: 'U123',
          },
        ],
      } as any);

      const result = await provider.callApi('Test prompt');

      expect(result.metadata?.threadTs).toBe('1234567890.123456');
    });
  });

  describe('metadata', () => {
    it('should include response time in metadata', async () => {
      const provider = new SlackProvider({
        config: {
          channel: 'C123',
          timeout: 5000,
        },
      });

      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      });

      mockWebClient.conversations.history
        .mockResolvedValueOnce({
          ok: true,
          messages: [],
        })
        .mockResolvedValueOnce({
          ok: true,
          messages: [
            {
              type: 'message',
              text: 'Response',
              ts: '1234567890.123457',
              user: 'U123',
            },
          ],
        });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Response');
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.responseTime).toBeDefined();
      expect(typeof result.metadata?.responseTime).toBe('number');
      expect(result.metadata?.responseTime).toBeGreaterThan(0);
      expect(result.metadata?.responseTime).toBeLessThan(5000);
    });
  });
});
