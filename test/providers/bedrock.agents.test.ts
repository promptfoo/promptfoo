import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock cache module
jest.mock('../../src/cache', () => ({
  getCache: jest.fn(() =>
    Promise.resolve({
      get: jest.fn(() => Promise.resolve(null)),
      set: jest.fn(),
    }),
  ),
  isCacheEnabled: jest.fn(() => false),
}));

// Mock the AWS SDK - this is needed for tests that don't use isolateModules
jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  InvokeAgentCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';

describe('AwsBedrockAgentsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should allow creation without agentAliasId but fail on callApi', async () => {
      const provider = new AwsBedrockAgentsProvider('test-agent-123');
      const result = await provider.callApi('test');
      expect(result.error).toContain('Agent Alias ID is required');
    });

    it('should create provider with agent ID from path and alias in config', () => {
      const provider = new AwsBedrockAgentsProvider('test-agent-123', {
        config: { agentId: 'test-agent-123', agentAliasId: 'test-alias' },
      });
      expect(provider.id()).toBe('bedrock-agent:test-agent-123');
    });

    it('should create provider with agent ID from config', () => {
      const provider = new AwsBedrockAgentsProvider('', {
        config: {
          agentId: 'config-agent-456',
          agentAliasId: 'test-alias',
        },
      });
      expect(provider.id()).toBe('bedrock-agent:config-agent-456');
    });

    it('should throw error when no agent ID is provided', () => {
      expect(
        () =>
          new AwsBedrockAgentsProvider('', {
            config: { agentAliasId: 'test-alias' } as any,
          }),
      ).toThrow(
        'Agent ID is required. Provide it in the provider path (bedrock-agent:AGENT_ID) or config.',
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
      const provider = new AwsBedrockAgentsProvider('', { config });
      expect(provider.config).toMatchObject(config);
    });
  });

  describe('callApi', () => {
    it('should require agentAliasId', async () => {
      const provider = new AwsBedrockAgentsProvider('test-agent', {
        config: {
          agentId: 'test-agent',
        } as any,
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Agent Alias ID is required');
      expect(result.output).toBeUndefined();
    });

    it('should successfully invoke agent with text response', async () => {
      // Use isolateModules to get completely fresh module instances
      await jest.isolateModulesAsync(async () => {
        const mockSend = jest.fn().mockResolvedValue({
          completion: (async function* () {
            yield {
              chunk: {
                bytes: new TextEncoder().encode('This is the agent response'),
              },
            };
          })(),
          sessionId: 'session-abc123',
          $metadata: {},
        });

        jest.doMock('@aws-sdk/client-bedrock-agent-runtime', () => ({
          BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
            send: mockSend,
          })),
          InvokeAgentCommand: jest.fn().mockImplementation((input: unknown) => input),
        }));

        const { AwsBedrockAgentsProvider: IsolatedProvider } = await import(
          '../../src/providers/bedrock/agents'
        );

        const provider = new IsolatedProvider('test-agent', {
          config: {
            agentId: 'test-agent',
            agentAliasId: 'test-alias',
            region: 'us-east-1',
          },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('This is the agent response');
        expect(result.error).toBeUndefined();
        expect(result.metadata?.sessionId).toBe('session-abc123');
        expect(mockSend).toHaveBeenCalled();
      });
    });

    it('should handle agent with tool calls and traces', async () => {
      await jest.isolateModulesAsync(async () => {
        const mockSend = jest.fn().mockResolvedValue({
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
        });

        jest.doMock('@aws-sdk/client-bedrock-agent-runtime', () => ({
          BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
            send: mockSend,
          })),
          InvokeAgentCommand: jest.fn().mockImplementation((input: unknown) => input),
        }));

        const { AwsBedrockAgentsProvider: IsolatedProvider } = await import(
          '../../src/providers/bedrock/agents'
        );

        const provider = new IsolatedProvider('test-agent', {
          config: {
            agentId: 'test-agent',
            agentAliasId: 'test-alias',
            region: 'us-east-1',
            enableTrace: true,
          },
        });

        const result = await provider.callApi('Calculate something');

        expect(result.output).toBe('Agent response with tool');
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
    });

    it('should handle memory configuration', async () => {
      await jest.isolateModulesAsync(async () => {
        const mockSend = jest.fn().mockResolvedValue({
          completion: (async function* () {
            yield {
              chunk: {
                bytes: new TextEncoder().encode('Response with memory'),
              },
            };
          })(),
          sessionId: 'session-mem123',
          $metadata: {},
        });

        jest.doMock('@aws-sdk/client-bedrock-agent-runtime', () => ({
          BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
            send: mockSend,
          })),
          InvokeAgentCommand: jest.fn().mockImplementation((input: unknown) => input),
        }));

        const { AwsBedrockAgentsProvider: IsolatedProvider } = await import(
          '../../src/providers/bedrock/agents'
        );

        const provider = new IsolatedProvider('test-agent', {
          config: {
            agentId: 'test-agent',
            agentAliasId: 'test-alias',
            region: 'us-east-1',
            memoryId: 'LONG_TERM_MEMORY',
          },
        });

        await provider.callApi('Test with memory');
        expect(provider.config.memoryId).toBe('LONG_TERM_MEMORY');
      });
    });

    it('should handle API errors gracefully', async () => {
      await jest.isolateModulesAsync(async () => {
        const mockSend = jest.fn().mockRejectedValue(new Error('AWS API Error'));

        jest.doMock('@aws-sdk/client-bedrock-agent-runtime', () => ({
          BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
            send: mockSend,
          })),
          InvokeAgentCommand: jest.fn().mockImplementation((input: unknown) => input),
        }));

        const { AwsBedrockAgentsProvider: IsolatedProvider } = await import(
          '../../src/providers/bedrock/agents'
        );

        const provider = new IsolatedProvider('test-agent', {
          config: {
            agentId: 'test-agent',
            agentAliasId: 'test-alias',
            region: 'us-east-1',
          },
        });

        const result = await provider.callApi('Test prompt');
        expect(result.error).toBeDefined();
        expect(result.error).toContain('Failed to invoke agent');
        expect(result.output).toBeUndefined();
      });
    });

    it('should use session ID from config if provided', async () => {
      await jest.isolateModulesAsync(async () => {
        const mockSend = jest.fn().mockResolvedValue({
          completion: (async function* () {
            yield {
              chunk: {
                bytes: new TextEncoder().encode('Response'),
              },
            };
          })(),
          sessionId: 'response-session-id',
          $metadata: {},
        });

        jest.doMock('@aws-sdk/client-bedrock-agent-runtime', () => ({
          BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
            send: mockSend,
          })),
          InvokeAgentCommand: jest.fn().mockImplementation((input: unknown) => input),
        }));

        const { AwsBedrockAgentsProvider: IsolatedProvider } = await import(
          '../../src/providers/bedrock/agents'
        );

        const provider = new IsolatedProvider('test-agent', {
          config: {
            agentId: 'test-agent',
            agentAliasId: 'test-alias',
            region: 'us-east-1',
            sessionId: 'fixed-session-id',
          },
        });

        await provider.callApi('Test prompt');
        expect(provider.config.sessionId).toBe('fixed-session-id');
      });
    });
  });

  describe('toString', () => {
    it('should return formatted string representation', () => {
      const provider = new AwsBedrockAgentsProvider('my-agent', {
        config: { agentId: 'my-agent', agentAliasId: 'test-alias' },
      });
      expect(provider.toString()).toBe('[AWS Bedrock Agents Provider my-agent]');
    });
  });
});
