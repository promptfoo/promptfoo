import {
  addTraceProcessor,
  BatchTraceProcessor,
  getOrCreateTrace,
  OpenAIProvider,
  protocol,
  Runner,
  startTraceExportLoop,
} from '@openai/agents';
import { SandboxAgent } from '@openai/agents/sandbox';
import OpenAI from 'openai';
import cliState from '../../cliState';
import { getEnvOverrides, getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { getConfiguredTracingExport } from '../tracing';
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
import type { Agent, AgentInputItem, OpenAIProviderOptions, Session } from '@openai/agents';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiAgentsSessionClientFactory } from './agents-loader';
import type { OpenAiAgentsOptions, OpenAiAgentsSessionFactory } from './agents-types';

/**
 * OpenAI Agents Provider
 *
 * Integrates openai-agents-js SDK as a promptfoo provider.
 * Supports multi-turn agent workflows with tools, handoffs, and tracing.
 */
export class OpenAiAgentsProvider extends OpenAiGenericProvider {
  readonly handlesOwnRetries = true;
  private agentConfig: OpenAiAgentsOptions;
  private agent?: Agent<any, any>;
  private readonly defaultSessionState: { session?: Session; initialization?: Promise<Session> } =
    {};
  private readonly scopedSessionStates = new WeakMap<
    object,
    { session?: Session; initialization?: Promise<Session> }
  >();
  private sessionQueues = new WeakMap<Session, Promise<void>>();

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
      validateExecuteTools(this.agentConfig.executeTools);

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

      const configuredAgent = agent.clone({
        tools: mergeArrays(agent.tools, tools),
        handoffs: mergeArrays(agent.handoffs, handoffs),
        inputGuardrails: mergeArrays(agent.inputGuardrails, inputGuardrails),
        outputGuardrails: mergeArrays(agent.outputGuardrails, outputGuardrails),
      });

      const mockAwareAgent = this.wrapToolsIfNeeded(configuredAgent);

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
    const hasConfiguredExporter = Boolean(
      this.agentConfig.otlpEndpoint || getConfiguredTracingExport(),
    );
    const tracingEnabled =
      this.agentConfig.tracing === true ||
      Boolean(context?.traceparent && hasConfiguredExporter) ||
      context?.test?.metadata?.tracingEnabled === true ||
      (this.env?.PROMPTFOO_TRACING_ENABLED ?? getEnvString('PROMPTFOO_TRACING_ENABLED')) === 'true';

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
    let modelProvider: OpenAIProvider | undefined;
    let scopedClient: ReturnType<OpenAiAgentsSessionClientFactory> | undefined;
    const useScopedModel = this.hasScopedConnectionSettings();
    const getClient: OpenAiAgentsSessionClientFactory = ({
      apiKey,
      baseURL,
      organization,
      project,
    } = {}) => {
      const overrides = { apiKey, baseURL, organization, project };
      return Object.values(overrides).some((value) => value !== undefined)
        ? this.createScopedClient(overrides)
        : (scopedClient ??= this.createScopedClient());
    };
    try {
      const maxTurns = this.agentConfig.maxTurns === undefined ? 10 : this.agentConfig.maxTurns;

      logger.debug('[AgentsProvider] Running agent', {
        agentName: this.agent?.name,
        maxTurns,
      });

      const runOptions: any = {
        ...(await this.resolveRunOptions(context, getClient)),
        context: context?.vars,
        maxTurns,
        signal: callApiOptions?.abortSignal,
      };

      // Override the agent's model only when the provider config explicitly asks to.
      // The provider suffix is an agent label, not a model identifier.
      if (this.agentConfig.model) {
        runOptions.model = this.agentConfig.model;
      }

      // Override model settings if specified
      if (this.agentConfig.modelSettings) {
        runOptions.modelSettings = resolveModelSettings(this.agentConfig.modelSettings);
      }

      if (this.agentConfig.executeTools === false || this.agentConfig.executeTools === 'mock') {
        assertNoMockToolOverrides(runOptions.modelSettings, 'run options');
      }

      const runner = new Runner({
        ...(useScopedModel && {
          modelProvider: {
            getModel: async (name) => {
              // SDK Model objects bypass this factory and retain their own clients.
              // The SDK's nested OpenAI dependency has a nominally distinct client type.
              modelProvider ??= new OpenAIProvider({
                openAIClient: getClient(),
              });
              return modelProvider.getModel(name);
            },
          },
        }),
      });

      const traceContext = parseTraceparent(context?.traceparent);
      const configuredExport = getConfiguredTracingExport();
      const explicitModel = runOptions.model ?? this.agent?.model;
      const traceMetadata = buildTraceMetadata(
        context,
        this.agentConfig.otlpEndpoint ?? configuredExport?.endpoint,
        traceContext,
        this.agentConfig.otlpEndpoint ? 'json' : configuredExport?.format,
        typeof explicitModel === 'string' ? explicitModel : undefined,
        getModelProviderName(explicitModel),
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
    } finally {
      await modelProvider?.close();
    }
  }

  private createScopedClient(
    overrides: Parameters<OpenAiAgentsSessionClientFactory>[0] = {},
  ): ReturnType<OpenAiAgentsSessionClientFactory> {
    const separateEndpoint = overrides.baseURL !== undefined;
    const separateCredentials = separateEndpoint || overrides.apiKey !== undefined;
    const apiKey = overrides.apiKey ?? (separateEndpoint ? undefined : this.getApiKey());
    const keyless = !separateEndpoint && !apiKey && !this.requiresApiKey();
    const config = {
      ...this.config,
      apiHost: undefined,
      apiBaseUrl: overrides.baseURL ?? this.getApiUrl(),
      organization: overrides.organization ?? (separateCredentials ? '' : this.config.organization),
      // New endpoints/credentials are isolated; metadata-only overrides keep gateway headers.
      headers: separateCredentials
        ? {}
        : Object.fromEntries(
            Object.entries(this.config.headers ?? {}).filter(
              ([name]) =>
                (overrides.organization === undefined ||
                  name.toLowerCase() !== 'openai-organization') &&
                (overrides.project === undefined || name.toLowerCase() !== 'openai-project'),
            ),
          ),
    };
    const organization = this.getOrganization(config);
    const apiUrl = new URL(config.apiBaseUrl);
    const query = apiUrl.search.slice(1);
    apiUrl.search = '';
    apiUrl.hash = '';
    return new OpenAI({
      // The SDK requires a constructor key; the null header keeps it off the wire.
      apiKey: keyless ? 'promptfoo-no-auth' : (apiKey ?? null),
      adminAPIKey: null,
      maxRetries: this.config.maxRetries,
      baseURL: apiUrl.toString(),
      organization,
      project: overrides.project ?? (separateCredentials ? null : undefined),
      defaultHeaders: {
        ...(keyless && { Authorization: null }),
        ...(organization === '' && { 'OpenAI-Organization': null }),
        ...(overrides.project === '' && { 'OpenAI-Project': null }),
        ...this.getOpenAiRequestHeaders(config.headers, config),
      },
      fetch: (input, options) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (query) {
          url.search = query + (url.search ? `&${url.search.slice(1)}` : '');
        }
        return fetchWithProxy(input instanceof Request ? new Request(url, input) : url.href, {
          ...options,
          disableTransientRetries: true,
        });
      },
    }) as unknown as NonNullable<OpenAIProviderOptions['openAIClient']>;
  }

  private hasScopedConnectionSettings(): boolean {
    const configKeys = [
      'apiKey',
      'apiKeyEnvar',
      'apiKeyRequired',
      'apiHost',
      'apiBaseUrl',
      'organization',
      'headers',
      'maxRetries',
    ] as const;
    if (
      configKeys.some((key) => this.config[key] !== undefined) ||
      this.config.useDefaultApiKey === false
    ) {
      return true;
    }
    const envKeys = [
      'OPENAI_API_KEY',
      'OPENAI_API_HOST',
      'OPENAI_API_BASE_URL',
      'OPENAI_BASE_URL',
      'OPENAI_ORGANIZATION',
    ] as const;
    const invocationEnvs = [getEnvOverrides(), getEnvOverrides('file')];
    return (
      [this.env, ...invocationEnvs].some((env) =>
        envKeys.some((key) => env?.[key] !== undefined),
      ) ||
      invocationEnvs.some((env) =>
        ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'].some(
          (key) => env?.[key] !== undefined || env?.[key.toLowerCase()] !== undefined,
        ),
      ) ||
      ['OPENAI_API_HOST', 'OPENAI_API_BASE_URL', 'OPENAI_BASE_URL', 'OPENAI_ORGANIZATION'].some(
        (key) => getEnvString(key) !== undefined,
      )
    );
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

    return this.wrapAgentForMockMode(agent, new WeakMap<object, Agent<any, any>>());
  }

  private wrapAgentForMockMode(
    agent: Agent<any, any>,
    wrappedAgents: WeakMap<object, Agent<any, any>>,
  ): Agent<any, any> {
    const existingWrappedAgent = wrappedAgents.get(agent as object);
    if (existingWrappedAgent) {
      return existingWrappedAgent;
    }

    if (agent instanceof SandboxAgent) {
      throw new Error(
        "executeTools: false/'mock' does not support SandboxAgent because capability tools are attached after function-tool mocks",
      );
    }

    if (agent.prompt !== undefined) {
      throw new Error(
        "executeTools: false/'mock' does not support reusable prompt templates because they can supply hosted tools outside function-tool mocks",
      );
    }

    assertNoMockToolOverrides(agent.modelSettings, `agent ${JSON.stringify(agent.name)}`);

    if (agent.mcpServers?.length) {
      throw new Error(
        "executeTools: false/'mock' does not support MCP servers because they can execute outside mocked function tools",
      );
    }

    const toolMocks = this.agentConfig.toolMocks ?? {};
    const tools = agent.tools.map((tool) => {
      if (tool.type !== 'function') {
        throw new Error(
          "executeTools: false/'mock' only supports function tools; remove hosted or non-function tools",
        );
      }

      const hasMockValue = Object.prototype.hasOwnProperty.call(toolMocks, tool.name);
      return {
        ...tool,
        isEnabled: async () => true,
        needsApproval: async () => false,
        inputGuardrails: [],
        outputGuardrails: [],
        timeoutMs: undefined,
        timeoutBehavior: undefined,
        timeoutErrorFunction: undefined,
        invoke: async () =>
          hasMockValue ? toolMocks[tool.name] : { mocked: true, tool: tool.name },
      };
    });

    const wrappedAgent = agent.clone({ tools, handoffs: [] });
    shareAgentEventEmitter(agent, wrappedAgent);
    wrappedAgents.set(agent as object, wrappedAgent);

    wrappedAgent.handoffs = agent.handoffs.map((agentHandoff) => {
      if (isAgentLike(agentHandoff)) {
        return this.wrapAgentForMockMode(agentHandoff, wrappedAgents);
      }

      if (agentHandoff && typeof agentHandoff === 'object' && 'agent' in agentHandoff) {
        throw new Error(
          "executeTools: false/'mock' does not support explicit Handoff objects because their callbacks can perform external side effects",
        );
      }

      throw new Error("executeTools: false/'mock' cannot safely wrap an unknown handoff shape");
    });

    return wrappedAgent;
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
    getClient?: OpenAiAgentsSessionClientFactory,
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
      runOptions.session = await loadSessionDefinition(runOptions.session, context, getClient);
    } else if (this.agentConfig.session) {
      runOptions.session = await this.resolveConfiguredSession(context, getClient);
    }

    if (runOptions.sandbox) {
      runOptions.sandbox = await loadSandboxConfig(runOptions.sandbox, context);
    } else if (this.agentConfig.sandbox) {
      runOptions.sandbox = await loadSandboxConfig(this.agentConfig.sandbox, context);
    }

    return runOptions;
  }

  private async resolveConfiguredSession(
    context?: CallApiContextParams,
    getClient?: OpenAiAgentsSessionClientFactory,
  ): Promise<Session> {
    if (typeof this.agentConfig.session === 'function') {
      const session = await loadSessionDefinition(this.agentConfig.session, context, getClient);
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
          getClient,
        );
        if (!session) {
          throw new Error('Failed to initialize configured session');
        }
        return session;
      }
    }

    const scope = getClient ? cliState.envScope : undefined;
    let state = scope ? this.scopedSessionStates.get(scope) : this.defaultSessionState;
    if (!state) {
      state = {};
      this.scopedSessionStates.set(scope!, state);
    }
    const sessionState = state;
    if (!sessionState.session) {
      sessionState.initialization ??= loadSessionDefinition(
        this.agentConfig.session,
        context,
        getClient,
      )
        .then((session) => {
          if (!session) {
            throw new Error('Failed to initialize configured session');
          }
          sessionState.session = session;
          return session;
        })
        .catch((error) => {
          sessionState.initialization = undefined;
          throw error;
        });
      return await sessionState.initialization;
    }

    return sessionState.session;
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
  otlpFormat?: 'json' | 'protobuf',
  requestedModel?: string,
  modelProvider?: string,
): Record<string, string> {
  return {
    ...(context?.evaluationId ? { 'evaluation.id': context.evaluationId } : {}),
    ...(context?.testCaseId ? { 'test.case.id': context.testCaseId } : {}),
    ...(traceContext?.parentSpanId
      ? { 'promptfoo.parent_span_id': traceContext.parentSpanId }
      : {}),
    ...(otlpEndpoint ? { 'promptfoo.otlp_endpoint': otlpEndpoint } : {}),
    ...(otlpFormat === 'protobuf' ? { 'promptfoo.otlp_format': otlpFormat } : {}),
    ...(requestedModel ? { 'promptfoo.request_model': requestedModel } : {}),
    ...(modelProvider ? { 'promptfoo.model_provider': modelProvider } : {}),
  };
}

function getModelProviderName(model: unknown): string | undefined {
  if (!model || typeof model !== 'object') {
    return undefined;
  }

  const modelRecord = model as Record<string, unknown>;
  for (const value of [modelRecord.provider, modelRecord.providerName, modelRecord.providerId]) {
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  return undefined;
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

function isAgentLike(value: unknown): value is Agent<any, any> {
  return (
    !!value &&
    typeof value === 'object' &&
    'clone' in value &&
    typeof (value as Agent<any, any>).clone === 'function' &&
    'tools' in value &&
    Array.isArray((value as Agent<any, any>).tools)
  );
}

function shareAgentEventEmitter(source: Agent<any, any>, target: Agent<any, any>): void {
  const sourceWithEmitter = source as unknown as { eventEmitter?: unknown };
  if (sourceWithEmitter.eventEmitter) {
    (target as unknown as { eventEmitter?: unknown }).eventEmitter = sourceWithEmitter.eventEmitter;
  }
}

function validateExecuteTools(value: unknown): void {
  if (
    value !== undefined &&
    value !== true &&
    value !== false &&
    value !== 'real' &&
    value !== 'mock'
  ) {
    throw new Error("executeTools must be true, false, 'real', or 'mock'");
  }
}

function assertNoMockToolOverrides(modelSettings: unknown, source: string): void {
  if (!modelSettings || typeof modelSettings !== 'object' || Array.isArray(modelSettings)) {
    return;
  }

  const providerData = (modelSettings as { providerData?: unknown }).providerData;
  if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
    return;
  }

  const providerDataRecord = providerData as Record<string, unknown>;
  const extraBodies = [providerDataRecord.extraBody, providerDataRecord.extra_body];
  const overridesPrompt =
    Object.prototype.hasOwnProperty.call(providerDataRecord, 'prompt') ||
    extraBodies.some(
      (extraBody) =>
        !!extraBody &&
        typeof extraBody === 'object' &&
        !Array.isArray(extraBody) &&
        Object.prototype.hasOwnProperty.call(extraBody, 'prompt'),
    );
  const overridesTools =
    Object.prototype.hasOwnProperty.call(providerDataRecord, 'tools') ||
    extraBodies.some(
      (extraBody) =>
        !!extraBody &&
        typeof extraBody === 'object' &&
        !Array.isArray(extraBody) &&
        Object.prototype.hasOwnProperty.call(extraBody, 'tools'),
    );

  if (overridesPrompt || overridesTools) {
    throw new Error(
      `executeTools: false/'mock' cannot safely use providerData ${overridesPrompt ? 'prompt' : 'tool'} overrides from ${source}`,
    );
  }
}
