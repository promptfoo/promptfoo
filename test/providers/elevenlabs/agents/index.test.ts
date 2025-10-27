// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ElevenLabsAgentsProvider } from '../../../../src/providers/elevenlabs/agents';
import type {  AgentSimulationResponse } from '../../../../src/providers/elevenlabs/agents/types';

// Mock dependencies
jest.mock('../../../../src/providers/elevenlabs/client');
jest.mock('../../../../src/providers/elevenlabs/cache');
jest.mock('../../../../src/providers/elevenlabs/cost-tracker');

describe('ElevenLabsAgentsProvider', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-api-key';

    // Mock the ElevenLabsClient
    const { ElevenLabsClient } = jest.requireMock('../../../../src/providers/elevenlabs/client');
    mockClient = {
      post: jest.fn(),
      get: jest.fn(),
    };
    (ElevenLabsClient as jest.Mock).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe('constructor', () => {
    it('should create provider with default configuration', () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent');

      expect(provider).toBeDefined();
      expect(provider.id()).toBe('elevenlabs:agent');
    });

    it('should throw error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsAgentsProvider('elevenlabs:agent')).toThrow(
        'ELEVENLABS_API_KEY environment variable is not set',
      );
    });

    it('should use custom configuration', () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: {
          agentId: 'test-agent-123',
          maxTurns: 5,
          simulatedUser: {
            persona: 'helpful customer',
            first_message: 'Hello',
          },
        },
      });

      expect(provider.config.agentId).toBe('test-agent-123');
      expect(provider.config.maxTurns).toBe(5);
      expect(provider.config.simulatedUser?.persona).toBe('helpful customer');
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        label: 'Custom Agent Label',
      });

      expect(provider.id()).toBe('Custom Agent Label');
    });

    it('should respect environment variable overrides', () => {
      const env = { CUSTOM_API_KEY: 'custom-key' };
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: {
          apiKeyEnvar: 'CUSTOM_API_KEY',
        },
        env,
      });

      expect(provider).toBeDefined();
    });
  });

  describe('toString()', () => {
    it('should return human-readable string', () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent');
      const str = provider.toString();

      expect(str).toContain('ElevenLabs Agents Provider');
    });

    it('should include agent ID when configured', () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: { agentId: 'test-agent-123' },
      });
      const str = provider.toString();

      expect(str).toContain('test-agent-123');
    });
  });

  describe('callApi - happy path', () => {
    it('should successfully simulate conversation with mocked API response', async () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: {
          agentId: 'test-agent-123',
          maxTurns: 3,
        },
      });

      // Mock realistic API response matching actual ElevenLabs API structure
      const mockApiResponse: AgentSimulationResponse = {
        conversation_id: 'conv_abc123',
        status: 'completed',
        simulated_conversation: [
          {
            role: 'user',
            content: 'What is the weather like today?',
            timestamp: Date.now(),
          },
          {
            role: 'agent',
            content: 'I can help you check the weather. Let me look that up for you.',
            timestamp: Date.now() + 1000,
            metadata: {
              duration_ms: 2500,
              toolCalls: [
                {
                  name: 'get_weather',
                  arguments: { location: 'current' },
                  result: { temperature: 72, condition: 'sunny' },
                },
              ],
            },
          },
          {
            role: 'user',
            content: 'Thank you!',
            timestamp: Date.now() + 3000,
          },
          {
            role: 'agent',
            content: "You're welcome! It's 72 degrees and sunny today.",
            timestamp: Date.now() + 4000,
            metadata: {
              duration_ms: 1800,
            },
          },
        ],
        llm_usage: {
          total_tokens: 250,
          prompt_tokens: 180,
          completion_tokens: 70,
          model: 'gpt-4o-mini',
        },
      };

      mockClient.post.mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('What is the weather like today?');

      // Verify the API was called with correct endpoint
      expect(mockClient.post).toHaveBeenCalledWith(
        '/convai/agents/test-agent-123/simulate-conversation',
        expect.objectContaining({
          conversation_history: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'What is the weather like today?',
            }),
          ]),
          new_turns_limit: 3,
        }),
      );

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify conversation data is present
      expect(result.metadata).toBeDefined();
      expect(result.metadata.conversation).toBeDefined();
      expect(result.metadata.conversation.length).toBe(4);

      // Verify tool usage is tracked
      expect(result.metadata.toolUsage).toBeDefined();
      expect(result.metadata.toolUsage.get_weather).toEqual({
        count: 1,
        successful: 1,
        failed: 0,
      });

      // Verify LLM usage is tracked
      expect(result.metadata.llmUsage).toEqual({
        total_tokens: 250,
        prompt_tokens: 180,
        completion_tokens: 70,
        model: 'gpt-4o-mini',
      });

      // Verify cost tracking
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should handle evaluation criteria in response', async () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: {
          agentId: 'test-agent-123',
          evaluationCriteria: [
            {
              name: 'Helpfulness',
              description: 'Agent provides helpful information',
            },
            {
              name: 'Accuracy',
              description: 'Information is accurate',
            },
          ],
        },
      });

      const mockApiResponse: AgentSimulationResponse = {
        conversation_id: 'conv_abc123',
        status: 'completed',
        simulated_conversation: [
          {
            role: 'user',
            content: 'Hello',
          },
          {
            role: 'agent',
            content: 'Hi there!',
          },
        ],
        analysis: {
          evaluation_results: [
            {
              name: 'Helpfulness',
              score: 0.9,
              reasoning: 'Agent was very helpful',
            },
            {
              name: 'Accuracy',
              score: 0.95,
              reasoning: 'Information was accurate',
            },
          ],
          overall_score: 0.925,
        },
        llm_usage: {
          total_tokens: 100,
          prompt_tokens: 70,
          completion_tokens: 30,
          model: 'gpt-4o-mini',
        },
      };

      mockClient.post.mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Hello');

      expect(result.metadata.evaluation).toBeDefined();
      expect(result.metadata.evaluation.overall_score).toBe(0.925);
      expect(result.metadata.evaluation.criteria.Helpfulness).toEqual({
        score: 0.9,
        reasoning: 'Agent was very helpful',
      });
      expect(result.metadata.evaluation.criteria.Accuracy).toEqual({
        score: 0.95,
        reasoning: 'Information was accurate',
      });
    });

    it('should handle tool mocking configuration', async () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: {
          agentId: 'test-agent-123',
          toolMockConfig: [
            {
              name: 'get_weather',
              mock_response: { temperature: 72, condition: 'sunny' },
            },
          ],
        },
      });

      const mockApiResponse: AgentSimulationResponse = {
        conversation_id: 'conv_abc123',
        status: 'completed',
        simulated_conversation: [],
        llm_usage: {
          total_tokens: 50,
          prompt_tokens: 30,
          completion_tokens: 20,
          model: 'gpt-4o-mini',
        },
      };

      mockClient.post.mockResolvedValue(mockApiResponse);

      await provider.callApi('Check weather');

      // Verify tool mocking was included in request
      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          simulation_specification: expect.objectContaining({
            tool_mocks: [
              {
                name: 'get_weather',
                mock_response: { temperature: 72, condition: 'sunny' },
              },
            ],
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: { agentId: 'test-agent-123' },
      });

      mockClient.post.mockRejectedValue(new Error('API Error: Rate limit exceeded'));

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('API Error: Rate limit exceeded');
    });

    it('should handle failed simulation status', async () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: { agentId: 'test-agent-123' },
      });

      const mockApiResponse: AgentSimulationResponse = {
        status: 'failed',
        error: 'Agent configuration error',
        simulated_conversation: [],
      };

      mockClient.post.mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Agent configuration error');
    });
  });
});
