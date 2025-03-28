import { RTMClient } from '@slack/rtm-api';
import { WebClient } from '@slack/web-api';
import logger from '../src/logger';
import { SlackbotProvider } from '../src/providers/slackbot';

// Silence logger warnings during tests
jest.mock('../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock the Slack clients
jest.mock('@slack/web-api', () => {
  return {
    WebClient: jest.fn().mockImplementation(() => {
      return {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ok: true }),
        },
        auth: {
          test: jest.fn().mockResolvedValue({ user_id: 'U012345BOT' }),
        },
      };
    }),
  };
});

jest.mock('@slack/rtm-api', () => {
  return {
    RTMClient: jest.fn().mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: jest.fn().mockResolvedValue({}),
        connected: true,
        on: jest.fn(),
        removeAllListeners: jest.fn(),
      };
    }),
  };
});

describe('Slackbot provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with required config', () => {
    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    expect(WebClient).toHaveBeenCalledWith('xoxb-test-token');
    expect(RTMClient).toHaveBeenCalledWith('xoxb-test-token');
    expect(provider.id()).toBe('promptfoo:slackbot');
  });

  it('throws error if token is missing', () => {
    expect(() => {
      new SlackbotProvider({
        config: {
          channel: 'C12345',
        },
      });
    }).toThrow('Slackbot provider requires a token');
  });

  it('throws error if both channel and userId are missing', () => {
    expect(() => {
      new SlackbotProvider({
        config: {
          token: 'xoxb-test-token',
        },
      });
    }).toThrow('Slackbot provider requires either a channel or userId');
  });

  it('warns if token does not start with xoxb-', () => {
    const warnSpy = jest.spyOn(logger, 'warn');

    new SlackbotProvider({
      config: {
        token: 'invalid-token',
        channel: 'C12345',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Slack token should start with xoxb- (Bot User OAuth Token)'),
    );
  });

  it('warns if channel ID format is invalid', () => {
    const warnSpy = jest.spyOn(logger, 'warn');

    new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'invalid-channel',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Channel ID should start with C followed by uppercase letters and numbers',
      ),
    );
  });

  it('warns if user ID format is invalid', () => {
    const warnSpy = jest.spyOn(logger, 'warn');

    new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        userId: 'invalid-user',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('User ID "invalid-user" does not match expected format'),
    );
  });

  it('overrides the default id if provided', () => {
    const provider = new SlackbotProvider({
      id: 'custom-slackbot',
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    expect(provider.id()).toBe('custom-slackbot');
  });

  it('sends message to channel and receives response', async () => {
    const mockOn = jest.fn().mockImplementation((event, callback) => {
      // Simulate a response after a short delay
      setTimeout(() => {
        callback({
          channel: 'C12345',
          text: 'This is a response',
          user: 'U54321',
          // Add some sensitive data that should be removed in metadata
          client_msg_id: 'sensitive-id-123',
          team: 'T12345',
        });
      }, 10);
    });

    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: jest.fn().mockResolvedValue({}),
        connected: true,
        on: mockOn,
        removeAllListeners: jest.fn(),
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
        timeout: 1000,
      },
    });

    const result = await provider.callApi('Hello, Slack!');

    expect(result).toEqual({
      output: 'This is a response',
      metadata: {
        rawResponse: {
          channel: 'C12345',
          text: 'This is a response',
          user: 'U54321',
          // Sensitive data should be removed
        },
      },
    });

    // Check sensitive data was removed
    expect(result.metadata?.rawResponse).not.toHaveProperty('client_msg_id');
    expect(result.metadata?.rawResponse).not.toHaveProperty('team');
  });

  it.skip('throws an error on timeout', async () => {
    // Set to fake timers before creating the provider
    jest.useFakeTimers();

    const mockOn = jest.fn(); // No callback gets triggered
    const mockDisconnect = jest.fn().mockResolvedValue({});

    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: mockDisconnect,
        connected: true,
        on: mockOn,
        removeAllListeners: jest.fn(),
        activeUserId: 'UBOT',
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
        timeout: 1000,
      },
    });

    // Create a promise for the expected rejection
    const callPromise = provider.callApi('Hello, Slack!');

    // Fast-forward timer until the timeout is triggered
    jest.runAllTimers();

    // Now await the rejection
    await expect(callPromise).rejects.toThrow('Timeout waiting for Slack response after 1000ms');
    expect(mockDisconnect).toHaveBeenCalled();

    // Restore real timers
    jest.useRealTimers();
  });

  it.skip('handles API errors when sending messages', async () => {
    // Mock a rate limit error
    const mockPostMessage = jest.fn().mockRejectedValue({
      code: 'slack_webapi_rate_limited',
      message: 'ratelimited: Too many requests',
    });

    jest.mocked(WebClient).mockImplementation(() => {
      return {
        chat: {
          postMessage: mockPostMessage,
        },
        auth: {
          test: jest.fn().mockResolvedValue({ user_id: 'U012345BOT' }),
        },
      };
    });

    const mockDisconnect = jest.fn().mockResolvedValue({});
    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: mockDisconnect,
        connected: true,
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        activeUserId: 'UBOT',
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    // Directly await the rejection since the error is thrown immediately when postMessage rejects
    await expect(provider.callApi('Hello, Slack!')).rejects.toThrow('Slack rate limit exceeded');
    expect(mockPostMessage).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it.skip('handles RTM client start errors', async () => {
    const mockStart = jest.fn().mockRejectedValue(new Error('Failed to connect to Slack RTM API'));

    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: mockStart,
        disconnect: jest.fn().mockResolvedValue({}),
        connected: false,
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        activeUserId: 'UBOT',
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    // Directly await the rejection since the error is thrown immediately when start rejects
    await expect(provider.callApi('Hello, Slack!')).rejects.toThrow(
      'Failed to start Slack RTM client',
    );
  });

  it.skip('handles errors during message processing', async () => {
    // Create a mock that throws an error when called
    const mockPostMessage = jest
      .fn()
      .mockRejectedValue(new Error('Error during message processing'));

    jest.mocked(WebClient).mockImplementation(() => {
      return {
        chat: {
          postMessage: mockPostMessage,
        },
        auth: {
          test: jest.fn().mockResolvedValue({ user_id: 'U012345BOT' }),
        },
      };
    });

    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: jest.fn().mockResolvedValue({}),
        connected: true,
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        activeUserId: 'UBOT',
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    // Directly await the error since postMessage will reject immediately
    await expect(provider.callApi('Hello, Slack!')).rejects.toThrow(
      'Error during message processing',
    );
    expect(mockPostMessage).toHaveBeenCalled();
  });

  it.skip('handles multiple concurrent requests', async () => {
    // Set up mocks for response callbacks
    const callbacks = {};
    const mockOn = jest.fn().mockImplementation((event, callback) => {
      callbacks[event] = callback;
    });

    // Track request count
    let requestCount = 0;

    const mockPostMessage = jest.fn().mockImplementation(async (params) => {
      requestCount++;
      const currentRequest = requestCount;

      // Immediately trigger the message event with a response
      setTimeout(() => {
        if (callbacks.message) {
          callbacks.message({
            channel: 'C12345',
            text: `Response ${currentRequest}`,
            user: 'U54321',
          });
        }
      }, 0);

      return { ok: true };
    });

    jest.mocked(WebClient).mockImplementation(() => {
      return {
        chat: {
          postMessage: mockPostMessage,
        },
        auth: {
          test: jest.fn().mockResolvedValue({ user_id: 'U012345BOT' }),
        },
      };
    });

    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: jest.fn().mockResolvedValue({}),
        connected: true,
        on: mockOn,
        removeAllListeners: jest.fn(),
        activeUserId: 'UBOT',
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    // Call each request sequentially due to the locking mechanism
    const result1 = await provider.callApi('Request 1');
    const result2 = await provider.callApi('Request 2');
    const result3 = await provider.callApi('Request 3');

    const results = [result1, result2, result3];

    // Verify results
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.output)).toEqual(['Response 1', 'Response 2', 'Response 3']);
  });

  it('cleans up resources when done', async () => {
    const mockDisconnect = jest.fn().mockResolvedValue({});

    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: mockDisconnect,
        connected: true,
        on: jest.fn(),
        removeAllListeners: jest.fn(),
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    await provider.cleanup();

    expect(mockDisconnect).toHaveBeenCalledWith();
  });

  it('handles errors during cleanup', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const mockDisconnect = jest.fn().mockRejectedValue(new Error('Disconnect failed'));

    jest.mocked(RTMClient).mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue({}),
        disconnect: mockDisconnect,
        connected: true,
        on: jest.fn(),
        removeAllListeners: jest.fn(),
      };
    });

    const provider = new SlackbotProvider({
      config: {
        token: 'xoxb-test-token',
        channel: 'C12345',
      },
    });

    await provider.cleanup();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Error during Slack cleanup'));
  });
});
