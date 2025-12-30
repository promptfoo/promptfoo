import {
  addTraceProcessor,
  BatchTraceProcessor,
  getOrCreateTrace,
  run,
  startTraceExportLoop,
} from '@openai/agents';
import logger from '../../logger';
import { loadAgentDefinition } from './agents-loader';
import { OTLPTracingExporter } from './agents-tracing';
import { OpenAiGenericProvider } from './index';
import type { Agent } from '@openai/agents';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiAgentsOptions } from './agents-types';

/**
 * OpenAI Agents Provider
 *
 * Integrates openai-agents-js SDK as a promptfoo provider.
 * Supports multi-turn agent workflows with tools, handoffs, and tracing.
 */
export class OpenAiAgentsProvider extends OpenAiGenericProvider {
  private agentConfig: OpenAiAgentsOptions;
  private agent?: Agent<any, any>;
  private tracingExporter?: OTLPTracingExporter;

  constructor(
    modelName: string,
    options: { config?: OpenAiAgentsOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.agentConfig = options.config || {};
  }

  id(): string {
    return `openai:agents:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Agents Provider ${this.modelName}]`;
  }

  /**
   * Call the agent with the given prompt
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    logger.debug('[AgentsProvider] Starting agent call', {
      prompt: prompt.substring(0, 100),
      hasContext: !!context,
    });

    try {
      // Initialize agent if not already initialized
      if (!this.agent) {
        this.agent = await this.initializeAgent();
      }

      // Setup tracing if enabled
      await this.setupTracingIfNeeded(context);

      // Run the agent
      const result = await this.runAgent(prompt, context, callApiOptions);

      logger.debug('[AgentsProvider] Agent run completed', {
        outputLength: result.output?.length || 0,
        tokenUsage: result.tokenUsage,
      });

      return result;
    } catch (error) {
      logger.error('[AgentsProvider] Agent call failed', { error });
      throw error;
    }
  }

  /**
   * Initialize the agent from configuration
   */
  private async initializeAgent(): Promise<Agent<any, any>> {
    logger.debug('[AgentsProvider] Initializing agent');

    if (!this.agentConfig.agent) {
      throw new Error('No agent configuration provided');
    }

    try {
      // Load agent definition (includes tools and handoffs if specified in agent file)
      const agent = await loadAgentDefinition(this.agentConfig.agent);

      logger.debug('[AgentsProvider] Agent initialized successfully', { name: agent.name });

      return agent;
    } catch (error) {
      logger.error('[AgentsProvider] Failed to initialize agent', { error });
      throw new Error(`Failed to initialize agent: ${error}`);
    }
  }

  /**
   * Setup tracing if enabled
   */
  private async setupTracingIfNeeded(context?: CallApiContextParams): Promise<void> {
    const tracingEnabled =
      this.agentConfig.tracing === true ||
      context?.test?.metadata?.tracingEnabled === true ||
      process.env.PROMPTFOO_TRACING_ENABLED === 'true';

    if (!tracingEnabled) {
      logger.debug('[AgentsProvider] Tracing not enabled');
      return;
    }

    logger.debug('[AgentsProvider] Setting up tracing');

    try {
      // Create OTLP exporter
      this.tracingExporter = new OTLPTracingExporter({
        otlpEndpoint: this.agentConfig.otlpEndpoint,
        evaluationId: context?.evaluationId,
        testCaseId: context?.testCaseId,
      });

      // Register with agent's tracing system
      await this.registerTracingExporter(this.tracingExporter);

      // Start the trace export loop
      startTraceExportLoop();

      logger.debug('[AgentsProvider] Tracing setup complete');
    } catch (error) {
      logger.error('[AgentsProvider] Failed to setup tracing', { error });
      // Don't throw - tracing failure shouldn't block agent execution
    }
  }

  /**
   * Register tracing exporter with openai-agents-js tracing system
   */
  private async registerTracingExporter(exporter: OTLPTracingExporter): Promise<void> {
    try {
      // Create batch processor with our exporter
      const processor = new BatchTraceProcessor(exporter, {
        maxQueueSize: 100,
        maxBatchSize: 10,
        scheduleDelay: 1000,
      });

      // Register processor
      addTraceProcessor(processor);

      logger.debug('[AgentsProvider] Tracing processor registered');
    } catch (error) {
      logger.error('[AgentsProvider] Failed to register tracing processor', { error });
      throw error;
    }
  }

  /**
   * Run the agent with the given prompt
   */
  private async runAgent(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      logger.debug('[AgentsProvider] Running agent', {
        agentName: this.agent?.name,
        maxTurns: this.agentConfig.maxTurns || 10,
      });

      // Build run options
      const runOptions: any = {
        context: context?.vars,
        maxTurns: this.agentConfig.maxTurns || 10,
        signal: callApiOptions?.abortSignal,
      };

      // Override model if specified in config
      if (this.agentConfig.model || this.modelName) {
        runOptions.model = this.agentConfig.model || this.modelName;
      }

      // Override model settings if specified
      if (this.agentConfig.modelSettings) {
        runOptions.modelSettings = this.agentConfig.modelSettings;
      }

      // Run the agent within a trace context to ensure proper trace ID generation
      const result = await getOrCreateTrace(async () => {
        return await run(this.agent!, prompt, runOptions);
      });

      logger.debug('[AgentsProvider] Agent run result', {
        hasOutput: !!result.finalOutput,
        turns: result.newItems?.length || 0,
      });

      // Build provider response
      const response: ProviderResponse = {
        output: result.finalOutput as string,
        tokenUsage: this.extractTokenUsage(result),
        cached: false,
        cost: this.calculateCost(result),
      };

      return response;
    } catch (error) {
      logger.error('[AgentsProvider] Failed to run agent', { error });
      throw error;
    }
  }

  /**
   * Extract token usage from agent result
   */
  private extractTokenUsage(result: any): { total?: number; prompt?: number; completion?: number } {
    if (!result.usage) {
      return {};
    }

    const usage = result.usage;

    return {
      total: usage.totalTokens || undefined,
      prompt: usage.promptTokens || undefined,
      completion: usage.completionTokens || undefined,
    };
  }

  /**
   * Calculate cost from agent result
   */
  private calculateCost(_result: any): number | undefined {
    // Cost calculation would depend on the model and usage
    // For now, return undefined as we don't have pricing info
    return undefined;
  }
}
