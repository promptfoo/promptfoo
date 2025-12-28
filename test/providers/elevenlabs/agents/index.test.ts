import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsAgentsProvider } from '../../../../src/providers/elevenlabs/agents';

import type { AgentSimulationResponse } from '../../../../src/providers/elevenlabs/agents/types';

// Mock dependencies
vi.mock('../../../../src/providers/elevenlabs/client');
vi.mock('../../../../src/providers/elevenlabs/cache');
vi.mock('../../../../src/providers/elevenlabs/cost-tracker', () => {
  return {
    CostTracker: class MockCostTracker {
      trackAgent = vi.fn().mockReturnValue(0.005);
      trackTTS = vi.fn().mockReturnValue(0.001);
      trackSTT = vi.fn().mockReturnValue(0.002);
      getSummary = vi.fn().mockReturnValue({ totalCost: 0.005, breakdown: [], byCapability: {} });
      reset = vi.fn();
      getBreakdown = vi.fn().mockReturnValue([]);
    },
  };
});

describe('ElevenLabsAgentsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
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
            prompt: 'helpful customer',
          },
        },
      });

      expect(provider.config.agentId).toBe('test-agent-123');
      expect(provider.config.maxTurns).toBe(5);
      expect(provider.config.simulatedUser?.prompt).toBe('helpful customer');
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        label: 'Custom Agent Label',
      });

      expect(provider.id()).toBe('Custom Agent Label');
    });

    it('should respect environment variable overrides', () => {
      process.env.CUSTOM_API_KEY = 'custom-key';
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: {
          apiKeyEnvar: 'CUSTOM_API_KEY',
        },
      });

      expect(provider).toBeDefined();
      delete process.env.CUSTOM_API_KEY;
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

      // Mock the client's post method on the provider instance
      (provider as any).client.post = vi.fn().mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('What is the weather like today?');

      // Verify the API was called with correct endpoint
      expect((provider as any).client.post).toHaveBeenCalledWith(
        '/convai/agents/test-agent-123/simulate-conversation',
        expect.objectContaining({
          new_turns_limit: 3,
          simulation_specification: expect.objectContaining({
            simulated_user_config: expect.objectContaining({
              first_message: 'What is the weather like today?',
            }),
          }),
        }),
      );

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify conversation data is present
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.conversationHistory).toBeDefined();
      expect(result.metadata!.conversationHistory.length).toBe(4);

      // Verify tool usage is tracked
      expect(result.metadata!.toolUsageAnalysis).toBeDefined();
      expect(result.metadata!.toolUsageAnalysis.totalCalls).toBe(1);
      expect(result.metadata!.toolUsageAnalysis.successfulCalls).toBe(1);
      expect(result.metadata!.toolUsageAnalysis.failedCalls).toBe(0);
      expect(result.metadata!.toolUsageAnalysis.callsByTool.get('get_weather')).toBe(1);

      // Verify LLM usage is tracked
      expect(result.tokenUsage).toEqual({
        total: 250,
        prompt: 180,
        completion: 70,
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

      // Mock the raw API response format (differs from typed interface)
      const mockApiResponse = {
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
          evaluation_criteria_results: {
            Helpfulness: {
              criteria_id: 'Helpfulness',
              result: 'success',
              rationale: 'Agent was very helpful',
            },
            Accuracy: {
              criteria_id: 'Accuracy',
              result: 'success',
              rationale: 'Information was accurate',
            },
          },
        },
        llm_usage: {
          total_tokens: 100,
          prompt_tokens: 70,
          completion_tokens: 30,
          model: 'gpt-4o-mini',
        },
      } as unknown as AgentSimulationResponse;

      // Mock the client's post method on the provider instance
      (provider as any).client.post = vi.fn().mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Hello');

      // Verify evaluation results are present
      expect(result.metadata!.evaluationResults).toBeDefined();
      expect(result.metadata!.evaluationResults).toHaveLength(2);
      expect(result.metadata!.overallScore).toBeDefined();

      // Find specific evaluation results
      const helpfulnessResult = result.metadata!.evaluationResults.find(
        (r: any) => r.criterion === 'Helpfulness',
      );
      expect(helpfulnessResult).toEqual({
        criterion: 'Helpfulness',
        score: 1.0,
        passed: true,
        feedback: 'Agent was very helpful',
        evidence: undefined,
      });

      const accuracyResult = result.metadata!.evaluationResults.find(
        (r: any) => r.criterion === 'Accuracy',
      );
      expect(accuracyResult).toEqual({
        criterion: 'Accuracy',
        score: 1.0,
        passed: true,
        feedback: 'Information was accurate',
        evidence: undefined,
      });
    });

    it('should handle tool mocking configuration', async () => {
      const provider = new ElevenLabsAgentsProvider('elevenlabs:agent', {
        config: {
          agentId: 'test-agent-123',
          toolMockConfig: {
            get_weather: {
              returnValue: { temperature: 72, condition: 'sunny' },
            },
          },
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

      // Mock the client's post method on the provider instance
      (provider as any).client.post = vi.fn().mockResolvedValue(mockApiResponse);

      await provider.callApi('Check weather');

      // Verify tool mocking was included in request
      expect((provider as any).client.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          simulation_specification: expect.objectContaining({
            tool_mock_config: expect.any(Object),
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

      // Mock the client's post method to reject
      (provider as any).client.post = vi
        .fn()
        .mockRejectedValue(new Error('API Error: Rate limit exceeded'));

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

      // Mock the client's post method on the provider instance
      (provider as any).client.post = vi.fn().mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain(
        'ElevenLabs Agents simulation failed: Agent configuration error',
      );
    });
  });
});
