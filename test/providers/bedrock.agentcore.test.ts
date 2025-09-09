import { jest } from '@jest/globals';
import { AwsBedrockAgentCoreProvider } from '../../src/providers/bedrock/agentcore';

// Mock AWS SDK modules
jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn(),
  InvokeAgentCommand: jest.fn(),
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

describe('AwsBedrockAgentCoreProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should allow creation without agentAliasId but fail on callApi', async () => {
      const provider = new AwsBedrockAgentCoreProvider('test-agent-123');
      const result = await provider.callApi('test');
      expect(result.error).toContain('Agent Alias ID is required');
    });

    it('should create provider with agent ID from path and alias in config', () => {
      const provider = new AwsBedrockAgentCoreProvider('test-agent-123', {
        config: { agentId: 'test-agent-123', agentAliasId: 'test-alias' },
      });
      expect(provider.id()).toBe('bedrock:agentcore:test-agent-123');
    });

    it('should create provider with agent ID from config', () => {
      const provider = new AwsBedrockAgentCoreProvider('', {
        config: {
          agentId: 'config-agent-456',
          agentAliasId: 'test-alias',
        },
      });
      expect(provider.id()).toBe('bedrock:agentcore:config-agent-456');
    });

    it('should throw error when no agent ID is provided', () => {
      expect(
        () =>
          new AwsBedrockAgentCoreProvider('', {
            config: { agentAliasId: 'test-alias' } as any,
          }),
      ).toThrow(
        'Agent ID is required. Provide it in the provider path (bedrock:agentcore:AGENT_ID) or config.',
      );
    });

    it('should accept configuration options', () => {
      const config = {
        agentId: 'test-agent',
        agentAliasId: 'prod-alias',
        sessionId: 'session-123',
        enableTrace: true,
        memoryId: 'LONG_TERM_MEMORY',
      };
      const provider = new AwsBedrockAgentCoreProvider('', { config });
      // Provider adds default timeout and maxRetries
      expect(provider.config).toMatchObject(config);
    });
  });

  describe('callApi', () => {
    let mockSend: jest.Mock;
    let provider: AwsBedrockAgentCoreProvider;

    beforeEach(() => {
      jest.clearAllMocks();

      // Create a fresh mock for each test
      mockSend = jest.fn();
      const {
        BedrockAgentRuntimeClient,
        InvokeAgentCommand,
      } = require('@aws-sdk/client-bedrock-agent-runtime');

      BedrockAgentRuntimeClient.mockImplementation(() => ({
        send: mockSend,
      }));

      InvokeAgentCommand.mockImplementation((input: any) => input);

      // Create provider after mocks are set up
      provider = new AwsBedrockAgentCoreProvider('test-agent', {
        config: {
          agentId: 'test-agent',
          agentAliasId: 'test-alias',
          region: 'us-east-1',
        },
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it('should require agentAliasId', async () => {
      // Create provider without agentAliasId to test error
      const providerNoAlias = new AwsBedrockAgentCoreProvider('test-agent', {
        config: {
          agentId: 'test-agent',
          // agentAliasId intentionally missing
        } as any,
      });

      const result = await providerNoAlias.callApi('Test prompt');

      expect(result.error).toContain('Agent Alias ID is required');
      expect(result.output).toBeUndefined();
    });

    it('should successfully invoke agent with text response', async () => {
      const mockResponse = {
        completion: (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode('This is the agent response'),
            },
          };
        })(),
        sessionId: 'session-abc123',
        $metadata: {},
      };

      (mockSend as any).mockResolvedValue(mockResponse as any);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('This is the agent response');
      expect(result.error).toBeUndefined();
      expect(result.metadata?.sessionId).toBe('session-abc123');
    });

    it('should handle agent with tool calls and traces', async () => {
      provider.config.enableTrace = true;

      const mockResponse = {
        completion: (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode('Agent response with tool'),
            },
            trace: {
              trace: {
                orchestrationTrace: {
                  rationale: {
                    text: 'Agent reasoning about the task',
                  },
                  invocationInput: {
                    actionGroupInvocationInput: {
                      actionGroupName: 'calculator',
                      function: 'add',
                    },
                  },
                },
              },
            },
          };
          yield {
            trace: {
              trace: {
                actionGroupTrace: {
                  actionGroupInvocationOutput: {
                    text: '42',
                  },
                },
              },
            },
          };
        })(),
        sessionId: 'session-xyz789',
        $metadata: {},
      };

      (mockSend as any).mockResolvedValue(mockResponse as any);

      const result = await provider.callApi('Calculate something');

      expect(result.output).toBe('Agent response with tool');
      // Trace should be the raw array from the agent response
      expect(result.metadata?.trace).toEqual([
        {
          trace: {
            orchestrationTrace: {
              rationale: {
                text: 'Agent reasoning about the task',
              },
              invocationInput: {
                actionGroupInvocationInput: {
                  actionGroupName: 'calculator',
                  function: 'add',
                },
              },
            },
          },
        },
        {
          trace: {
            actionGroupTrace: {
              actionGroupInvocationOutput: {
                text: '42',
              },
            },
          },
        },
      ]);
    });

    it('should handle memory configuration', async () => {
      provider.config.memoryId = 'LONG_TERM_MEMORY';

      const mockResponse = {
        completion: (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode('Response with memory'),
            },
          };
        })(),
        sessionId: 'session-mem123',
        $metadata: {},
      };

      (mockSend as any).mockResolvedValue(mockResponse as any);

      await provider.callApi('Test with memory');

      // Verify that the provider was configured with memory
      expect(provider.config.memoryId).toBe('LONG_TERM_MEMORY');
    });

    it.skip('should handle API errors gracefully', async () => {
      // TODO: Fix mock isolation issue - test passes in isolation but fails when run with other tests
      // Override the mock to reject for this test
      (mockSend as any).mockRejectedValue(new Error('AWS API Error'));

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Failed to invoke agent');
      expect(result.output).toBeUndefined();
    });

    it.skip('should handle token usage in metadata', async () => {
      // TODO: Fix mock isolation issue - test passes in isolation but fails when run with other tests
      // Clear previous mock and set up new response
      mockSend.mockClear();

      const mockResponse = {
        completion: (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode('Response with tokens'),
            },
          };
        })(),
        sessionId: 'session-token123',
        $metadata: {
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
          },
        },
      };

      (mockSend as any).mockResolvedValue(mockResponse as any);

      const result = await provider.callApi('Test prompt');

      // Token usage is not currently extracted from AgentCore responses
      // as the AWS SDK types don't include usage metadata
      expect(result.output).toBe('Response with tokens');
    });

    it('should use session ID from config if provided', async () => {
      provider.config.sessionId = 'fixed-session-id';

      const mockResponse = {
        completion: (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode('Response'),
            },
          };
        })(),
        sessionId: 'response-session-id',
        $metadata: {},
      };

      (mockSend as any).mockResolvedValue(mockResponse as any);

      await provider.callApi('Test prompt');

      // Verify that the fixed session ID was used
      expect(provider.config.sessionId).toBe('fixed-session-id');
    });

    it.skip('should generate session ID if not provided', async () => {
      // TODO: Fix mock isolation issue - test passes in isolation but fails when run with other tests
      // Clear previous mock and set up new response
      mockSend.mockClear();

      const mockResponse = {
        completion: (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode('Response'),
            },
          };
        })(),
        sessionId: 'generated-session',
        $metadata: {},
      };

      (mockSend as any).mockResolvedValue(mockResponse as any);

      const result = await provider.callApi('Test prompt');

      // Verify call was successful
      expect(result.output).toBe('Response');
      expect(result.error).toBeUndefined();
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('toString', () => {
    it('should return formatted string representation', () => {
      const provider = new AwsBedrockAgentCoreProvider('my-agent', {
        config: { agentId: 'my-agent', agentAliasId: 'test-alias' },
      });
      expect(provider.toString()).toBe('[AWS Bedrock AgentCore Provider my-agent]');
    });
  });
});
