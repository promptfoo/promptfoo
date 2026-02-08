/**
 * ElevenLabs Conversational Agents Provider
 *
 * Test and evaluate voice AI agents with LLM backends
 */

import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { ElevenLabsCache } from '../cache';
import { ElevenLabsClient } from '../client';
import { CostTracker } from '../cost-tracker';
import { buildSimulationRequest, parseConversation } from './conversation';
import {
  calculateOverallScore,
  generateEvaluationSummary,
  processEvaluationResults,
} from './evaluation';
import { analyzeToolUsage, extractToolCalls, generateToolUsageSummary } from './tools';

import type { EnvOverrides } from '../../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../../types/providers';
import type { AgentSimulationResponse, ElevenLabsAgentsConfig } from './types';

/**
 * ElevenLabs Agents Provider Implementation
 */
export class ElevenLabsAgentsProvider implements ApiProvider {
  private client: ElevenLabsClient;
  private cache: ElevenLabsCache;
  private costTracker: CostTracker;
  config: ElevenLabsAgentsConfig;
  private env?: EnvOverrides;
  private ephemeralAgentId: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    modelName: string,
    options: {
      config?: Partial<ElevenLabsAgentsConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { id, env } = options;
    this.env = env;
    this.config = this.parseConfig(modelName, options);

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'ELEVENLABS_API_KEY environment variable is not set. Please set it to use ElevenLabs Agents.',
      );
    }

    this.client = new ElevenLabsClient({
      apiKey,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout || 180000, // 3 minutes for agents
      retries: this.config.retries,
    });

    this.cache = new ElevenLabsCache({
      enabled: this.config.cache !== false,
      ttl: this.config.cacheTTL,
    });

    this.costTracker = new CostTracker();

    // Override id if provided
    if (id) {
      this.id = () => id;
    }

    // Initialize advanced features asynchronously
    this.initPromise = this.initializeAdvancedFeatures();
  }

  id(): string {
    return this.config.label || 'elevenlabs:agent';
  }

  toString(): string {
    return `[ElevenLabs Agents Provider] ${this.config.agentId || 'Ephemeral Agent'}`;
  }

  /**
   * Initialize advanced features
   */
  private async initializeAdvancedFeatures(): Promise<void> {
    try {
      // Validate configurations
      this.validateConfigurations();

      // No initialization needed yet - will be done per-agent during callApi
    } catch (error) {
      logger.error('[ElevenLabs Agents] Advanced features initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - fall back to basic agent functionality
    }
  }

  /**
   * Validate all advanced feature configurations
   */
  private validateConfigurations(): void {
    // No advanced feature validations needed currently
    // Future advanced features will be validated here
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Wait for initialization
    if (this.initPromise != null) {
      await this.initPromise;
      this.initPromise = null;
    }

    const startTime = Date.now();

    try {
      // Get or create agent
      const agentId = await this.getOrCreateAgent();

      logger.debug('[ElevenLabs Agents] Running simulation', {
        agentId,
        promptLength: prompt.length,
      });

      // Parse conversation
      const conversationHistory = parseConversation(prompt, context);

      // Build simulation request
      const simulationRequest = buildSimulationRequest(
        conversationHistory,
        this.config.simulatedUser,
        this.config.evaluationCriteria,
        this.config.toolMockConfig,
      );

      // Add new_turns_limit (API field name)
      simulationRequest.new_turns_limit = this.config.maxTurns || 10;

      // Debug: Log the request being sent
      logger.debug('[ElevenLabs Agents] Request payload', {
        endpoint: `/convai/agents/${agentId}/simulate-conversation`,
        payload: simulationRequest, // Auto-sanitized by logger
      });

      // Run simulation
      const response = await this.client.post<AgentSimulationResponse>(
        `/convai/agents/${agentId}/simulate-conversation`,
        simulationRequest,
      );

      // Check for failed simulation
      if (response.status === 'failed') {
        return {
          error: `ElevenLabs Agents simulation failed: ${response.error || 'Unknown error'}`,
          metadata: {
            latency: Date.now() - startTime,
          },
        };
      }

      // Process results
      return this.buildResponse(response, startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ElevenLabs Agents] Simulation failed', { error: errorMessage });

      return {
        error: `ElevenLabs Agents simulation error: ${errorMessage}`,
        metadata: {
          latency: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Get or create agent
   */
  private async getOrCreateAgent(): Promise<string> {
    // Use existing agent if provided
    if (this.config.agentId) {
      return this.config.agentId;
    }

    // Check cache for ephemeral agent
    const cacheKey = this.cache.generateKey('agent', this.config.agentConfig);
    const cachedAgentId = await this.cache.get<string>(cacheKey);

    if (cachedAgentId) {
      logger.debug('[ElevenLabs Agents] Using cached ephemeral agent', {
        agentId: cachedAgentId,
      });
      this.ephemeralAgentId = cachedAgentId;
      return cachedAgentId;
    }

    // Create new ephemeral agent
    logger.debug('[ElevenLabs Agents] Creating ephemeral agent');

    const config = this.config.agentConfig;
    const agentCreationRequest = {
      name: config?.name || `promptfoo-agent-${Date.now()}`,
      conversation_config: {
        agent: {
          prompt: {
            prompt: config?.prompt || 'You are a helpful assistant.',
            llm: config?.llmModel,
            temperature: config?.temperature,
            max_tokens: config?.maxTokens,
          },
          first_message: config?.firstMessage,
          language: config?.language || 'en',
        },
        tts: {
          voice_id: config?.voiceId,
        },
      },
    };

    const response = await this.client.post<{ agent_id: string }>(
      '/convai/agents/create',
      agentCreationRequest,
    );

    this.ephemeralAgentId = response.agent_id;
    await this.cache.set(cacheKey, this.ephemeralAgentId);

    logger.debug('[ElevenLabs Agents] Ephemeral agent created', {
      agentId: this.ephemeralAgentId,
    });

    return this.ephemeralAgentId;
  }

  /**
   * Build provider response from simulation result
   */
  private buildResponse(response: AgentSimulationResponse, startTime: number): ProviderResponse {
    // Process evaluation results
    const evaluationResults = response.analysis?.evaluation_criteria_results
      ? processEvaluationResults(response.analysis.evaluation_criteria_results)
      : new Map();

    const overallScore = calculateOverallScore(evaluationResults);
    const evaluationSummary = generateEvaluationSummary(evaluationResults);

    // Get conversation history (API uses simulated_conversation)
    const conversationHistory = response.simulated_conversation || response.history || [];

    // Extract and analyze tool calls
    const toolCalls = extractToolCalls(conversationHistory);
    const toolUsageAnalysis = analyzeToolUsage(toolCalls);
    const toolUsageSummary = generateToolUsageSummary(toolCalls);

    // Estimate duration for cost tracking
    const durationMinutes = this.estimateDuration(response);

    // Track cost
    const cost = this.costTracker.trackAgent(durationMinutes, true, {
      agentId: this.config.agentId || this.ephemeralAgentId,
      llmUsage: response.llm_usage,
      evaluationCriteria: this.config.evaluationCriteria?.length || 0,
    });

    return {
      output: response.analysis?.transcript_summary || 'Agent conversation completed',
      cached: false,
      tokenUsage: response.llm_usage
        ? {
            total: response.llm_usage.total_tokens,
            prompt: response.llm_usage.prompt_tokens,
            completion: response.llm_usage.completion_tokens,
          }
        : undefined,
      cost,
      metadata: {
        conversationId: response.conversation_id,
        agentId: this.config.agentId || this.ephemeralAgentId,
        status: response.status,
        durationMinutes,
        latency: Date.now() - startTime,

        // Conversation data
        conversationHistory,
        turnCount: conversationHistory.length,

        // Evaluation data
        evaluationResults: Array.from(evaluationResults.values()),
        overallScore,
        evaluationSummary,
        callSuccessful: response.analysis?.call_successful,

        // Tool usage data
        toolCalls,
        toolUsageAnalysis,
        toolUsageSummary,

        // Analysis data
        sentiment: response.analysis?.sentiment,
        topics: response.analysis?.topics,
        actionItems: response.analysis?.actionItems,

        // Error information
        error: response.error,
      },
    };
  }

  /**
   * Estimate conversation duration
   */
  private estimateDuration(response: AgentSimulationResponse): number {
    // Estimate based on number of turns (API uses simulated_conversation)
    const history = response.simulated_conversation || response.history || [];
    const turns = history.length;
    const avgSecondsPerTurn = 15; // Conservative estimate
    return (turns * avgSecondsPerTurn) / 60; // Convert to minutes
  }

  /**
   * Parse configuration from constructor options
   */
  private parseConfig(
    _modelName: string,
    options: {
      config?: Partial<ElevenLabsAgentsConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    },
  ): ElevenLabsAgentsConfig {
    const { config } = options;

    return {
      apiKey: config?.apiKey,
      apiKeyEnvar: config?.apiKeyEnvar || 'ELEVENLABS_API_KEY',
      baseUrl: config?.baseUrl,
      timeout: config?.timeout || 180000,
      cache: config?.cache,
      cacheTTL: config?.cacheTTL,
      retries: config?.retries || 3,

      // Agent-specific config
      agentId: config?.agentId,
      agentConfig: config?.agentConfig,
      simulatedUser: config?.simulatedUser,
      evaluationCriteria: config?.evaluationCriteria,
      toolMockConfig: config?.toolMockConfig,
      maxTurns: config?.maxTurns || 10,
      label: options.label || options.id,
    };
  }

  /**
   * Get API key from config or environment
   */
  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config.apiKeyEnvar && this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]) ||
      (this.config.apiKeyEnvar && getEnvString(this.config.apiKeyEnvar as any)) ||
      this.env?.ELEVENLABS_API_KEY ||
      getEnvString('ELEVENLABS_API_KEY')
    );
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Delete ephemeral agent if created
    if (this.ephemeralAgentId) {
      try {
        await this.client.delete(`/convai/agents/${this.ephemeralAgentId}`);
        logger.debug('[ElevenLabs Agents] Ephemeral agent deleted', {
          agentId: this.ephemeralAgentId,
        });
      } catch (error) {
        logger.warn('[ElevenLabs Agents] Failed to delete ephemeral agent', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
