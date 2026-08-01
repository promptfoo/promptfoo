import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

import {
  Agent,
  addTraceProcessor,
  BatchTraceProcessor,
  getOrCreateTrace,
  protocol,
  Runner,
  startTraceExportLoop,
} from '@openai/agents';
import { getDirectory, importModule, resolvePackageEntryPoint } from '../../esm';
import logger from '../../logger';
import {
  loadAgentDefinition,
  loadHandoffs,
  loadInputGuardrails,
  loadOutputGuardrails,
  loadSandboxConfig,
  loadSessionDefinition,
  loadTools,
  loadValueFromFile,
} from './agents-loader';
import { resolveModelSettings } from './agents-model-settings';
import { OTLPTracingExporter } from './agents-tracing';
import { OpenAiGenericProvider } from './index';
import type { AgentInputItem, Handoff, ModelSettings, Session, Tool } from '@openai/agents';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiAgentsOptions, OpenAiAgentsSessionFactory } from './agents-types';

const AGENT_TOOL_METADATA = Symbol.for('promptfoo.openaiAgents.agentToolMetadata');
const AGENT_AS_TOOL_INSTRUMENTED = Symbol.for('promptfoo.openaiAgents.asToolInstrumented');

type AgentToolMetadata = {
  sourceAgent: Agent<any, any>;
};

type TrackedAgentTool = Extract<Tool<any>, { type: 'function' }> & {
  [AGENT_TOOL_METADATA]?: AgentToolMetadata;
  on?: (name: string, handler: (...args: any[]) => unknown) => TrackedAgentTool;
};

function instrumentAgentAsTool(): void {
  const prototype = Agent.prototype as Agent<any, any> & {
    asTool: Agent<any, any>['asTool'] & { [AGENT_AS_TOOL_INSTRUMENTED]?: boolean };
  };
  const currentAsTool = prototype.asTool;
  if (currentAsTool[AGENT_AS_TOOL_INSTRUMENTED]) {
    return;
  }

  const instrumentedAsTool = function (
    this: Agent<any, any>,
    options: Parameters<Agent<any, any>['asTool']>[0],
  ): ReturnType<Agent<any, any>['asTool']> {
    const tool = currentAsTool.call(this, options) as TrackedAgentTool;
    const metadata: AgentToolMetadata = {
      sourceAgent: this,
    };
    Object.defineProperty(tool, AGENT_TOOL_METADATA, { configurable: true, value: metadata });

    return tool as ReturnType<Agent<any, any>['asTool']>;
  };
  Object.defineProperty(instrumentedAsTool, AGENT_AS_TOOL_INSTRUMENTED, { value: true });
  prototype.asTool = instrumentedAsTool as Agent<any, any>['asTool'];
}

instrumentAgentAsTool();

type AgentToolSourceRegistry = {
  getAgentToolSourceAgent: (tool: Tool<any>) => Agent<any, any> | undefined;
  registerAgentToolSourceAgent: (tool: Tool<any>, agent: Agent<any, any>) => void;
};

let agentToolSourceRegistriesPromise: Promise<AgentToolSourceRegistry[]> | undefined;

async function loadAgentToolSourceRegistries(): Promise<AgentToolSourceRegistry[]> {
  agentToolSourceRegistriesPromise ??= (async () => {
    const entryPoint = resolvePackageEntryPoint('@openai/agents-core', getDirectory());
    if (!entryPoint) {
      return [];
    }

    // Agent.asTool() intentionally hides its source agent. The SDK keeps that relationship in an
    // internal registry for run-state serialization, so load both module variants to match the
    // ESM or CJS Agents build selected by the current promptfoo entrypoint.
    const registryPaths = [
      path.join(path.dirname(entryPoint), 'agentToolSourceRegistry.mjs'),
      path.join(path.dirname(entryPoint), 'agentToolSourceRegistry.js'),
    ];
    const loaded = await Promise.allSettled(
      registryPaths.map((registryPath) => importModule(registryPath)),
    );

    return loaded.flatMap((result) => {
      if (result.status !== 'fulfilled') {
        return [];
      }
      const registry = result.value as Partial<AgentToolSourceRegistry>;
      return typeof registry.getAgentToolSourceAgent === 'function' &&
        typeof registry.registerAgentToolSourceAgent === 'function'
        ? [registry as AgentToolSourceRegistry]
        : [];
    });
  })();

  return agentToolSourceRegistriesPromise;
}

async function getAgentToolSourceAgent(
  tool: TrackedAgentTool,
): Promise<Agent<any, any> | undefined> {
  const trackedSource = tool[AGENT_TOOL_METADATA]?.sourceAgent;
  if (trackedSource) {
    return trackedSource;
  }

  for (const registry of await loadAgentToolSourceRegistries()) {
    const sourceAgent = registry.getAgentToolSourceAgent(tool);
    if (sourceAgent) {
      return sourceAgent;
    }
  }

  return undefined;
}

async function registerAgentToolSourceAgent(
  tool: TrackedAgentTool,
  sourceAgent: Agent<any, any>,
): Promise<void> {
  Object.defineProperty(tool, AGENT_TOOL_METADATA, {
    configurable: true,
    value: { sourceAgent } satisfies AgentToolMetadata,
  });
  for (const registry of await loadAgentToolSourceRegistries()) {
    registry.registerAgentToolSourceAgent(tool, sourceAgent);
  }
}

const activeAgentToolOverrides = new AsyncLocalStorage<Set<Agent<any, any>>>();
const agentToolOverrideQueues = new WeakMap<Agent<any, any>, Promise<void>>();

async function withAgentToolOverrides<T>(
  sourceAgent: Agent<any, any>,
  overriddenAgent: Agent<any, any>,
  callback: () => Promise<T>,
): Promise<T> {
  const activeOverrides = activeAgentToolOverrides.getStore();
  if (activeOverrides?.has(sourceAgent)) {
    return callback();
  }

  const previousRun = agentToolOverrideQueues.get(sourceAgent) ?? Promise.resolve();
  let release: () => void = () => {};
  const currentRun = new Promise<void>((resolve) => {
    release = resolve;
  });
  agentToolOverrideQueues.set(sourceAgent, currentRun);
  await previousRun;

  const original = {
    model: sourceAgent.model,
    modelSettings: sourceAgent.modelSettings,
    handoffs: sourceAgent.handoffs,
    tools: sourceAgent.tools,
  };
  sourceAgent.model = overriddenAgent.model;
  sourceAgent.modelSettings = overriddenAgent.modelSettings;
  sourceAgent.handoffs = overriddenAgent.handoffs;
  sourceAgent.tools = overriddenAgent.tools;

  try {
    return await activeAgentToolOverrides.run(
      new Set([...(activeOverrides ?? []), sourceAgent]),
      callback,
    );
  } finally {
    sourceAgent.model = original.model;
    sourceAgent.modelSettings = original.modelSettings;
    sourceAgent.handoffs = original.handoffs;
    sourceAgent.tools = original.tools;
    release();
    if (agentToolOverrideQueues.get(sourceAgent) === currentRun) {
      agentToolOverrideQueues.delete(sourceAgent);
    }
  }
}

/**
 * OpenAI Agents Provider
 *
 * Integrates openai-agents-js SDK as a promptfoo provider.
 * Supports multi-turn agent workflows with tools, handoffs, and tracing.
 */
export class OpenAiAgentsProvider extends OpenAiGenericProvider {
  private agentConfig: OpenAiAgentsOptions;
  private agent?: Agent<any, any>;
  private executionModelSettings?: ModelSettings;
  private session?: Session;
  private sessionInitialization?: Promise<Session>;
  private sessionQueues = new WeakMap<Session, Promise<void>>();

  constructor(
    modelName: string,
    options: { config?: OpenAiAgentsOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.agentConfig = options.config || {};
    // The Agents SDK can replace its global OpenAI client or model provider independently of
    // promptfoo (setDefaultOpenAIClient/setDefaultModelProvider), and exposes no public getter for
    // that effective endpoint. Applying first-party catalog restrictions here would therefore
    // reject valid custom-provider model IDs. Let the configured SDK provider resolve them.
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
      const [tools, handoffs, inputGuardrails, outputGuardrails] = await Promise.all([
        loadTools(this.agentConfig.tools),
        loadHandoffs(this.agentConfig.handoffs),
        loadInputGuardrails(this.agentConfig.inputGuardrails),
        loadOutputGuardrails(this.agentConfig.outputGuardrails),
      ]);

      const configuredAgent = cloneAgentPreservingHooks(agent, {
        tools: mergeArrays(agent.tools, tools),
        handoffs: mergeArrays(agent.handoffs, handoffs),
        inputGuardrails: mergeArrays(agent.inputGuardrails, inputGuardrails),
        outputGuardrails: mergeArrays(agent.outputGuardrails, outputGuardrails),
      });

      this.executionModelSettings = resolveModelSettings(this.agentConfig.modelSettings);
      const overriddenAgent = await applyExecutionOverrides(configuredAgent, {
        model: this.agentConfig.model || undefined,
        modelSettings: this.executionModelSettings,
      });
      const mockAwareAgent = this.wrapToolsIfNeeded(overriddenAgent);

      logger.debug('[AgentsProvider] Agent initialized successfully', {
        name: mockAwareAgent.name,
        toolCount: mockAwareAgent.tools.length,
        handoffCount: mockAwareAgent.handoffs.length,
        inputGuardrailCount: mockAwareAgent.inputGuardrails.length,
        outputGuardrailCount: mockAwareAgent.outputGuardrails.length,
      });

      return mockAwareAgent;
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
      await ensureTracingExporterRegistered();

      logger.debug('[AgentsProvider] Tracing setup complete');
    } catch (error) {
      logger.error('[AgentsProvider] Failed to setup tracing', { error });
      // Don't throw - tracing failure shouldn't block agent execution
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
      const maxTurns = this.agentConfig.maxTurns === undefined ? 10 : this.agentConfig.maxTurns;

      logger.debug('[AgentsProvider] Running agent', {
        agentName: this.agent?.name,
        maxTurns,
      });

      const runOptions: any = {
        ...(await this.resolveRunOptions(context)),
        context: context?.vars,
        maxTurns,
        signal: callApiOptions?.abortSignal,
      };

      // Keep Runner defaults for SDK-created agents while the cloned graph above enforces the
      // provider overrides on explicit initial and handoff agents.
      const runner = new Runner({
        ...(this.agentConfig.model ? { model: this.agentConfig.model } : {}),
        ...(this.executionModelSettings ? { modelSettings: this.executionModelSettings } : {}),
      });

      const traceContext = parseTraceparent(context?.traceparent);
      const traceMetadata = buildTraceMetadata(
        context,
        this.agentConfig.otlpEndpoint,
        traceContext,
      );

      // Run the agent within the evaluator trace when Promptfoo supplied one so
      // nested agent spans stay attached to trajectory assertions and UI traces.
      const executeRun = () =>
        getOrCreateTrace(
          async () => {
            return await runner.run(this.agent!, this.parsePromptInput(prompt), runOptions);
          },
          {
            ...(traceContext ? { traceId: `trace_${traceContext.traceId}` } : {}),
            ...(Object.keys(traceMetadata).length ? { metadata: traceMetadata } : {}),
          },
        );
      const result = runOptions.session
        ? await this.withSessionLock(runOptions.session, executeRun)
        : await executeRun();

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
  private extractTokenUsage(result: any): NonNullable<ProviderResponse['tokenUsage']> {
    const usage = result.runContext?.usage ?? result.state?.usage ?? result.usage;
    if (!usage) {
      return {};
    }

    const inputDetails = summarizeUsageDetails(usage.inputTokensDetails);
    const outputDetails = summarizeUsageDetails(usage.outputTokensDetails);
    const cachedInputTokens =
      inputDetails.cached_tokens ??
      inputDetails.cache_read_input_tokens ??
      inputDetails.cacheReadInputTokens;
    const completionDetails = {
      ...(outputDetails.reasoning_tokens === undefined
        ? {}
        : { reasoning: outputDetails.reasoning_tokens }),
      ...(outputDetails.accepted_prediction_tokens === undefined
        ? {}
        : { acceptedPrediction: outputDetails.accepted_prediction_tokens }),
      ...(outputDetails.rejected_prediction_tokens === undefined
        ? {}
        : { rejectedPrediction: outputDetails.rejected_prediction_tokens }),
      ...(cachedInputTokens === undefined ? {} : { cacheReadInputTokens: cachedInputTokens }),
    };

    return {
      total: usage.totalTokens ?? undefined,
      prompt: usage.inputTokens ?? usage.promptTokens ?? undefined,
      completion: usage.outputTokens ?? usage.completionTokens ?? undefined,
      ...(cachedInputTokens === undefined ? {} : { cached: cachedInputTokens }),
      ...(usage.requests === undefined ? {} : { numRequests: usage.requests }),
      ...(Object.keys(completionDetails).length ? { completionDetails } : {}),
    };
  }

  /**
   * Calculate cost from agent result
   */
  private calculateCost(_result: any): number | undefined {
    // The Agents SDK exposes aggregate usage, but a run can include handoffs to
    // agents with different models. Without per-model usage, no exact total is available.
    return undefined;
  }

  private wrapToolsIfNeeded(agent: Agent<any, any>): Agent<any, any> {
    if (this.agentConfig.executeTools !== false && this.agentConfig.executeTools !== 'mock') {
      return agent;
    }

    const toolMocks = this.agentConfig.toolMocks ?? {};
    const tools = agent.tools.map((tool) => {
      if (tool.type !== 'function') {
        return tool;
      }

      const mockValue = toolMocks[tool.name];
      return {
        ...tool,
        invoke: async () => mockValue ?? { mocked: true, tool: tool.name },
      };
    });

    return cloneAgentPreservingHooks(agent, { tools });
  }

  private parsePromptInput(prompt: string): string | AgentInputItem[] {
    try {
      const parsedPrompt: unknown = JSON.parse(prompt);
      const parsedInput = parseAgentInputItems(parsedPrompt);
      if (parsedInput) {
        return parsedInput;
      }
    } catch {
      // Fall back to plain text input.
    }

    return prompt;
  }

  private async resolveRunOptions(
    context?: CallApiContextParams,
  ): Promise<Record<string, unknown>> {
    const runOptions = { ...(this.agentConfig.runOptions ?? {}) } as Record<string, any>;
    delete runOptions.stream;

    if (typeof runOptions.sessionInputCallback === 'string') {
      runOptions.sessionInputCallback = await loadValueFromFile(
        runOptions.sessionInputCallback,
        'session input callback',
      );
    }

    if (typeof runOptions.callModelInputFilter === 'string') {
      runOptions.callModelInputFilter = await loadValueFromFile(
        runOptions.callModelInputFilter,
        'call model input filter',
      );
    }

    if (typeof runOptions.toolErrorFormatter === 'string') {
      runOptions.toolErrorFormatter = await loadValueFromFile(
        runOptions.toolErrorFormatter,
        'tool error formatter',
      );
    }

    if (typeof runOptions.errorHandlers === 'string') {
      runOptions.errorHandlers = await loadValueFromFile(
        runOptions.errorHandlers,
        'run error handlers',
      );
    }

    if (runOptions.session) {
      runOptions.session = await loadSessionDefinition(runOptions.session, context);
    } else if (this.agentConfig.session) {
      runOptions.session = await this.resolveConfiguredSession(context);
    }

    if (runOptions.sandbox) {
      runOptions.sandbox = await loadSandboxConfig(runOptions.sandbox, context);
    } else if (this.agentConfig.sandbox) {
      runOptions.sandbox = await loadSandboxConfig(this.agentConfig.sandbox, context);
    }

    return runOptions;
  }

  private async resolveConfiguredSession(context?: CallApiContextParams): Promise<Session> {
    if (typeof this.agentConfig.session === 'function') {
      const session = await loadSessionDefinition(this.agentConfig.session, context);
      if (!session) {
        throw new Error('Failed to initialize configured session');
      }
      return session;
    }

    if (
      typeof this.agentConfig.session === 'string' &&
      this.agentConfig.session.startsWith('file://')
    ) {
      const exportedSession = await loadValueFromFile<unknown>(this.agentConfig.session, 'session');
      if (typeof exportedSession === 'function') {
        const session = await loadSessionDefinition(
          exportedSession as OpenAiAgentsSessionFactory,
          context,
        );
        if (!session) {
          throw new Error('Failed to initialize configured session');
        }
        return session;
      }
    }

    if (!this.session) {
      this.sessionInitialization ??= loadSessionDefinition(this.agentConfig.session, context)
        .then((session) => {
          if (!session) {
            throw new Error('Failed to initialize configured session');
          }
          this.session = session;
          return session;
        })
        .catch((error) => {
          this.sessionInitialization = undefined;
          throw error;
        });
      return await this.sessionInitialization;
    }

    return this.session;
  }

  private async withSessionLock<T>(session: Session, callback: () => Promise<T>): Promise<T> {
    const previousRun = this.sessionQueues.get(session) ?? Promise.resolve();
    let release: () => void = () => {};
    const currentRun = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.sessionQueues.set(session, currentRun);

    await previousRun;
    try {
      return await callback();
    } finally {
      release();
      if (this.sessionQueues.get(session) === currentRun) {
        this.sessionQueues.delete(session);
      }
    }
  }
}

function mergeArrays<T>(existing?: T[], additions?: T[]): T[] | undefined {
  if (!existing?.length && !additions?.length) {
    return undefined;
  }

  return [...(existing ?? []), ...(additions ?? [])];
}

function cloneAgentPreservingHooks(
  source: Agent<any, any>,
  config: Parameters<Agent<any, any>['clone']>[0],
): Agent<any, any> {
  const cloned = source.clone(config);
  const sourceHooks = source as unknown as { eventEmitter: unknown };
  const clonedHooks = cloned as unknown as { eventEmitter: unknown };
  // Agent.clone() creates a fresh lifecycle emitter. The provider replaces the cloned graph at
  // execution time, so share the source emitter to preserve all registered hook semantics.
  clonedHooks.eventEmitter = sourceHooks.eventEmitter;
  return cloned;
}

/**
 * Clone the executable agent graph so provider-level model overrides win on every turn.
 *
 * The Agents SDK treats Runner model configuration as a fallback: explicit settings on an agent
 * take precedence. Handoff agents therefore need the same overrides applied before execution.
 */
async function applyExecutionOverrides(
  agent: Agent<any, any>,
  overrides: { model?: string; modelSettings?: ModelSettings },
): Promise<Agent<any, any>> {
  if (overrides.model === undefined && overrides.modelSettings === undefined) {
    return agent;
  }

  const clonedAgents = new WeakMap<Agent<any, any>, Agent<any, any>>();

  const cloneAgent = async (source: Agent<any, any>): Promise<Agent<any, any>> => {
    const existing = clonedAgents.get(source);
    if (existing) {
      return existing;
    }

    const cloned = cloneAgentPreservingHooks(source, {
      ...(overrides.model === undefined ? {} : { model: overrides.model }),
      ...(overrides.modelSettings === undefined ? {} : { modelSettings: overrides.modelSettings }),
      handoffs: [],
      tools: [],
    });
    clonedAgents.set(source, cloned);

    cloned.tools = await Promise.all(
      source.tools.map(async (tool) => {
        const trackedTool = tool as TrackedAgentTool;
        const sourceAgent = await getAgentToolSourceAgent(trackedTool);
        if (!sourceAgent) {
          return tool;
        }

        const overriddenSourceAgent = await cloneAgent(sourceAgent);
        // Agent.asTool() closes over its source Agent, and the public tool API exposes neither that
        // source nor the original tool options. Wrap the existing invocation so every user option
        // and event handler remains intact, while temporarily applying the cloned graph. The
        // per-agent lock prevents concurrent providers from racing those temporary overrides.
        const wrappedTool: TrackedAgentTool = {
          ...trackedTool,
          invoke: (...args: Parameters<TrackedAgentTool['invoke']>) =>
            withAgentToolOverrides(sourceAgent, overriddenSourceAgent, () =>
              trackedTool.invoke(...args),
            ),
        };
        if (trackedTool.on) {
          wrappedTool.on = (name, handler) => {
            trackedTool.on?.(name, handler);
            return wrappedTool;
          };
        }
        await registerAgentToolSourceAgent(wrappedTool, sourceAgent);
        return wrappedTool;
      }),
    );
    cloned.handoffs = await Promise.all(
      source.handoffs.map(async (candidate) => {
        if ('clone' in candidate && 'agent' in candidate) {
          const handoff = candidate as Handoff<any, any>;
          return handoff.clone({
            agent: await cloneAgent(handoff.agent),
            onInvokeHandoff: async (context, args) =>
              cloneAgent(await handoff.onInvokeHandoff(context, args)),
          });
        }

        return cloneAgent(candidate as Agent<any, any>);
      }),
    );

    return cloned;
  };

  return cloneAgent(agent);
}

let tracingProcessorRegistration: Promise<void> | undefined;

async function ensureTracingExporterRegistered(): Promise<void> {
  if (!tracingProcessorRegistration) {
    tracingProcessorRegistration = Promise.resolve().then(() => {
      const processor = new BatchTraceProcessor(new OTLPTracingExporter(), {
        maxQueueSize: 100,
        maxBatchSize: 10,
        scheduleDelay: 1000,
      });

      addTraceProcessor(processor);
      startTraceExportLoop();
      logger.debug('[AgentsProvider] Tracing processor registered');
    });
  }

  await tracingProcessorRegistration;
}

function parseTraceparent(
  traceparent?: string,
): { traceId: string; parentSpanId: string } | undefined {
  if (!traceparent) {
    return undefined;
  }

  const match = traceparent
    .trim()
    .toLowerCase()
    .match(/^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/);
  if (!match) {
    return undefined;
  }

  return {
    traceId: match[1],
    parentSpanId: match[2],
  };
}

function buildTraceMetadata(
  context?: CallApiContextParams,
  otlpEndpoint?: string,
  traceContext?: { traceId: string; parentSpanId: string },
): Record<string, string> {
  return {
    ...(context?.evaluationId ? { 'evaluation.id': context.evaluationId } : {}),
    ...(context?.testCaseId ? { 'test.case.id': context.testCaseId } : {}),
    ...(traceContext?.parentSpanId
      ? { 'promptfoo.parent_span_id': traceContext.parentSpanId }
      : {}),
    ...(otlpEndpoint ? { 'promptfoo.otlp_endpoint': otlpEndpoint } : {}),
  };
}

function summarizeUsageDetails(
  details: Array<Record<string, number>> | Record<string, number> | undefined,
): Record<string, number> {
  const entries = Array.isArray(details) ? details : details ? [details] : [];
  const summary: Record<string, number> = {};

  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === 'number') {
        summary[key] = (summary[key] ?? 0) + value;
      }
    }
  }

  return summary;
}

function parseAgentInputItems(value: unknown): AgentInputItem[] | undefined {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }

    const parsedItems: AgentInputItem[] = [];
    for (const item of value) {
      const parsedItem = protocol.ModelItem.safeParse(item);
      if (!parsedItem.success) {
        return undefined;
      }
      parsedItems.push(parsedItem.data);
    }
    return parsedItems;
  }

  const parsedItem = protocol.ModelItem.safeParse(value);
  if (!parsedItem.success) {
    return undefined;
  }

  return [parsedItem.data];
}
