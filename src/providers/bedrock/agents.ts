import { getCache, isCacheEnabled } from '../../cache';
import { getEnvInt } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { sha256 } from '../../util/createHash';
import { AwsBedrockGenericProvider } from './base';
import { isValidBedrockRetrievalFilter } from './retrievalFilter';
import { createBedrockRequestHandler, hasProxyEnv } from './util';
import type {
  BedrockAgentRuntimeClient,
  InferenceConfig,
  InvokeAgentCommandInput,
  InvokeAgentCommandOutput,
  KnowledgeBaseRetrievalConfiguration,
  SessionState,
} from '@aws-sdk/client-bedrock-agent-runtime';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, ProviderResponse } from '../../types/providers';

/**
 * Configuration options for AWS Bedrock Agents provider
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html
 */
interface BedrockAgentsOptions {
  // AWS Authentication
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  profile?: string;
  region?: string;

  // Required Agent Configuration
  agentId: string;
  agentAliasId: string;

  // Session Management
  sessionId?: string;
  sessionState?: SessionState;
  bedrockModelConfigurations?: InvokeAgentCommandInput['bedrockModelConfigurations'];
  streamingConfigurations?: InvokeAgentCommandInput['streamingConfigurations'];
  promptCreationConfigurations?: InvokeAgentCommandInput['promptCreationConfigurations'];
  sourceArn?: InvokeAgentCommandInput['sourceArn'];

  // Memory Configuration
  memoryId?: string;

  // Execution Configuration
  enableTrace?: boolean;
  endSession?: boolean;

  // Inference Configuration (can be specified at root level for convenience or nested)
  temperature?: number;
  topP?: number;
  topK?: number;
  maximumLength?: number;
  stopSequences?: string[];
  inferenceConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maximumLength?: number;
    stopSequences?: string[];
  };

  // Guardrails
  guardrailConfiguration?: {
    guardrailId: string;
    guardrailVersion: string;
  };

  // Prompt Override
  promptOverrideConfiguration?: {
    promptConfigurations: Array<{
      promptType:
        | 'PRE_PROCESSING'
        | 'ORCHESTRATION'
        | 'POST_PROCESSING'
        | 'KNOWLEDGE_BASE_RESPONSE_GENERATION';
      promptCreationMode: 'DEFAULT' | 'OVERRIDDEN';
      promptState?: 'ENABLED' | 'DISABLED';
      basePromptTemplate?: string;
      inferenceConfiguration?: {
        temperature?: number;
        topP?: number;
        topK?: number;
        maximumLength?: number;
        stopSequences?: string[];
      };
      parserMode?: 'DEFAULT' | 'OVERRIDDEN';
    }>;
  };

  // Knowledge Base Configuration
  knowledgeBaseConfigurations?: Array<{
    knowledgeBaseId: string;
    retrievalConfiguration?: KnowledgeBaseRetrievalConfiguration;
  }>;

  // Action Group Configuration
  actionGroups?: Array<{
    actionGroupName: string;
    actionGroupExecutor?: {
      lambda?: string;
      customControl?: 'RETURN_CONTROL';
    };
    apiSchema?: {
      s3?: {
        s3BucketName: string;
        s3ObjectKey: string;
      };
      payload?: string;
    };
    description?: string;
  }>;

  // Content Filtering
  inputDataConfig?: {
    bypassLambdaParsing?: boolean;
    filters?: Array<{
      name: string;
      type: 'PREPROCESSING' | 'POSTPROCESSING';
      inputType: 'TEXT' | 'IMAGE';
      outputType: 'TEXT' | 'IMAGE';
    }>;
  };
}

/**
 * AWS Bedrock Agents provider for invoking deployed AI agents.
 * Supports all Bedrock Agents features including memory, knowledge bases, action groups,
 * guardrails, and session management.
 *
 * @example Basic usage
 * ```yaml
 * providers:
 *   - bedrock-agent:AGENT_ID
 *     config:
 *       agentAliasId: PROD_ALIAS
 *       region: us-east-1
 * ```
 *
 * @example With memory and session
 * ```yaml
 * providers:
 *   - bedrock-agent:AGENT_ID
 *     config:
 *       agentAliasId: PROD_ALIAS
 *       sessionId: user-session-123
 *       memoryId: LONG_TERM_MEMORY
 *       enableTrace: true
 * ```
 *
 * @example With guardrails and inference config
 * ```yaml
 * providers:
 *   - bedrock-agent:AGENT_ID
 *     config:
 *       agentAliasId: PROD_ALIAS
 *       guardrailConfiguration:
 *         guardrailId: GUARDRAIL_ID
 *         guardrailVersion: "1"
 *       temperature: 0.7  # Can be specified at root level for convenience
 *         topP: 0.9
 *         maximumLength: 2048
 * ```
 */
export class AwsBedrockAgentsProvider extends AwsBedrockGenericProvider implements ApiProvider {
  private agentRuntimeClient?: BedrockAgentRuntimeClient;
  config: BedrockAgentsOptions; // Make public to match base class

  constructor(
    agentId: string,
    options: { config?: BedrockAgentsOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(agentId, options);

    // Validate required fields
    if (!agentId && !options.config?.agentId) {
      throw new Error(
        'Agent ID is required. Provide it in the provider path (bedrock-agent:AGENT_ID) or config.',
      );
    }

    // Note: agentAliasId is validated in callApi to allow partial construction for testing
    this.config = {
      ...options.config,
      agentId: options.config?.agentId || agentId,
    } as BedrockAgentsOptions;

    // Record telemetry
    telemetry.record('feature_used', {
      feature: 'bedrock-agents',
      provider: 'bedrock',
    });
  }

  id(): string {
    return `bedrock-agent:${this.config.agentId}`;
  }

  toString(): string {
    return `[AWS Bedrock Agents Provider ${this.config.agentId}]`;
  }

  /**
   * Get or create the Bedrock Agent Runtime client
   */
  async getAgentRuntimeClient(): Promise<BedrockAgentRuntimeClient> {
    if (!this.agentRuntimeClient) {
      // client-bedrock-agent-runtime already defaults to HTTP/1.1, so we only
      // need a custom handler for proxy support.
      const handler = hasProxyEnv() ? await createBedrockRequestHandler() : undefined;

      try {
        const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime');
        const credentials = await this.getCredentials();

        this.agentRuntimeClient = new BedrockAgentRuntimeClient({
          region: this.getRegion(),
          maxAttempts: getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
          retryMode: 'adaptive',
          ...(handler ? { requestHandler: handler } : {}),
          ...(credentials ? { credentials } : {}),
        });
      } catch (err) {
        logger.error(`Error creating BedrockAgentRuntimeClient: ${err}`);
        throw new Error(
          'The @aws-sdk/client-bedrock-agent-runtime package is required. Please install it: npm install @aws-sdk/client-bedrock-agent-runtime',
        );
      }
    }
    return this.agentRuntimeClient;
  }

  /**
   * Build the session state from configuration
   */
  private buildSessionState(): SessionState | undefined {
    // ID-only entries use the agent's deployed configuration. Runtime overrides
    // require retrievalConfiguration, so do not send those legacy entries.
    const knowledgeBaseConfigurations = this.config.knowledgeBaseConfigurations?.filter(
      (
        configuration,
      ): configuration is {
        knowledgeBaseId: string;
        retrievalConfiguration: KnowledgeBaseRetrievalConfiguration;
      } => configuration.retrievalConfiguration !== undefined,
    );
    if (!this.config.sessionState && !knowledgeBaseConfigurations?.length) {
      return undefined;
    }

    const configured = this.config.sessionState;
    const sessionState: SessionState = {
      ...configured,
      ...(knowledgeBaseConfigurations?.length ? { knowledgeBaseConfigurations } : {}),
      ...(configured?.files
        ? {
            files: configured.files.map((file) => ({
              ...file,
              ...(file.source?.byteContent
                ? {
                    source: {
                      ...file.source,
                      byteContent: {
                        ...file.source.byteContent,
                        data:
                          typeof file.source.byteContent.data === 'string'
                            ? Buffer.from(file.source.byteContent.data, 'base64')
                            : file.source.byteContent.data,
                      },
                    },
                  }
                : {}),
            })),
          }
        : {}),
    };

    return sessionState;
  }

  /**
   * Build inference configuration from both root-level and nested parameters
   * Root-level parameters take precedence over nested ones for convenience
   */
  private buildInferenceConfig(): InferenceConfig | undefined {
    // Check if we have any inference config at root level or nested
    const hasRootConfig =
      this.config.temperature !== undefined ||
      this.config.topP !== undefined ||
      this.config.topK !== undefined ||
      this.config.maximumLength !== undefined ||
      this.config.stopSequences !== undefined;

    const hasNestedConfig = this.config.inferenceConfig !== undefined;

    if (!hasRootConfig && !hasNestedConfig) {
      return undefined;
    }

    // Build inference config according to AWS SDK types
    // Note: Using partial typing due to AWS SDK type constraints
    const inferenceConfig = {} as InferenceConfig;

    // Start with nested config as base
    if (this.config.inferenceConfig) {
      if (this.config.inferenceConfig.maximumLength !== undefined) {
        (inferenceConfig as any).maximumLength = this.config.inferenceConfig.maximumLength;
      }
      if (this.config.inferenceConfig.stopSequences !== undefined) {
        (inferenceConfig as any).stopSequences = this.config.inferenceConfig.stopSequences;
      }
      if (this.config.inferenceConfig.temperature !== undefined) {
        (inferenceConfig as any).temperature = this.config.inferenceConfig.temperature;
      }
      if (this.config.inferenceConfig.topP !== undefined) {
        (inferenceConfig as any).topP = this.config.inferenceConfig.topP;
      }
      if (this.config.inferenceConfig.topK !== undefined) {
        (inferenceConfig as any).topK = this.config.inferenceConfig.topK;
      }
    }

    // Override with root-level parameters (these take precedence for convenience)
    if (this.config.temperature !== undefined) {
      (inferenceConfig as any).temperature = this.config.temperature;
    }
    if (this.config.topP !== undefined) {
      (inferenceConfig as any).topP = this.config.topP;
    }
    if (this.config.topK !== undefined) {
      (inferenceConfig as any).topK = this.config.topK;
    }
    if (this.config.maximumLength !== undefined) {
      (inferenceConfig as any).maximumLength = this.config.maximumLength;
    }
    if (this.config.stopSequences !== undefined) {
      (inferenceConfig as any).stopSequences = this.config.stopSequences;
    }

    return inferenceConfig;
  }

  /**
   * Process the streaming response from the agent
   */
  private async processResponse(response: InvokeAgentCommandOutput): Promise<ProviderResponse> {
    if (!response.completion) {
      throw new Error('Bedrock returned no agent completion stream');
    }
    let output = '';
    const traces: unknown[] = [];
    const citations: unknown[] = [];
    const files: unknown[] = [];
    const returnControl: unknown[] = [];
    let guardrailIntervened = false;
    const decoder = new TextDecoder();
    for await (const event of response.completion) {
      const failure = Object.entries(event).find(([key]) => key.endsWith('Exception'));
      if (failure) {
        throw new Error(
          `${failure[0]}: ${(failure[1] as { message?: string }).message ?? 'Bedrock agent stream failed'}`,
        );
      }
      if (event.chunk?.bytes) {
        output += decoder.decode(event.chunk.bytes, { stream: true });
      }
      if (event.chunk?.attribution?.citations) {
        citations.push(...event.chunk.attribution.citations);
      }
      if (event.trace) {
        if (this.config.enableTrace) {
          traces.push(event.trace);
        }
        guardrailIntervened ||= event.trace.trace?.guardrailTrace?.action === 'INTERVENED';
      }
      if (event.returnControl) {
        returnControl.push(event.returnControl);
      }
      if (event.files?.files) {
        files.push(
          ...event.files.files.map((file) => ({
            ...file,
            ...(file.bytes ? { bytes: Buffer.from(file.bytes).toString('base64') } : {}),
          })),
        );
      }
    }
    output += decoder.decode();
    return {
      output:
        output ||
        (returnControl.length
          ? JSON.stringify(returnControl)
          : files.length
            ? JSON.stringify(files)
            : ''),
      metadata: {
        ...(response.contentType ? { contentType: response.contentType } : {}),
        ...(response.sessionId ? { sessionId: response.sessionId } : {}),
        ...((response.memoryId ?? this.config.memoryId)
          ? { memoryId: response.memoryId ?? this.config.memoryId }
          : {}),
        ...(traces.length ? { trace: traces } : {}),
        ...(citations.length ? { citations } : {}),
        ...(returnControl.length ? { returnControl } : {}),
        ...(files.length ? { files } : {}),
      },
      ...(guardrailIntervened ? { guardrails: { flagged: true, reason: 'INTERVENED' } } : {}),
    };
  }

  /**
   * Invoke the agent with the given prompt
   */
  async callApi(prompt: string): Promise<ProviderResponse> {
    // Validate agentAliasId is present
    if (!this.config.agentAliasId) {
      return {
        error: 'Agent Alias ID is required. Set agentAliasId in the provider config.',
      };
    }

    for (const [index, configuration] of (
      this.config.knowledgeBaseConfigurations ?? []
    ).entries()) {
      const filter = configuration.retrievalConfiguration?.vectorSearchConfiguration?.filter;
      if (filter !== undefined && !isValidBedrockRetrievalFilter(filter)) {
        return {
          error: `Invalid knowledgeBaseConfigurations[${index}].retrievalConfiguration.vectorSearchConfiguration.filter: use an AWS RetrievalFilter with one operator, such as equals, or andAll/orAll with at least two operands. Flat metadata maps are not supported.`,
        };
      }
    }

    for (const [index, configuration] of (
      this.config.sessionState?.knowledgeBaseConfigurations ?? []
    ).entries()) {
      const filter = configuration.retrievalConfiguration?.vectorSearchConfiguration?.filter;
      if (filter !== undefined && !isValidBedrockRetrievalFilter(filter)) {
        return {
          error: `Invalid sessionState.knowledgeBaseConfigurations[${index}].retrievalConfiguration.vectorSearchConfiguration.filter: use a valid AWS RetrievalFilter operator.`,
        };
      }
    }

    const client = await this.getAgentRuntimeClient();

    // Generate session ID if not provided
    const sessionId =
      this.config.sessionId ||
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `session-${crypto.randomUUID()}`
        : `session-${Date.now()}-${process.hrtime.bigint().toString(36)}`);

    const inferenceConfig = this.buildInferenceConfig();

    // Build the complete input with all supported features
    const input: InvokeAgentCommandInput = {
      // Required fields
      agentId: this.config.agentId,
      agentAliasId: this.config.agentAliasId,
      sessionId,
      inputText: prompt,

      // Optional features
      enableTrace: this.config.enableTrace,
      endSession: this.config.endSession,
      sessionState: this.buildSessionState(),
      memoryId: this.config.memoryId,
      ...(this.config.bedrockModelConfigurations
        ? { bedrockModelConfigurations: this.config.bedrockModelConfigurations }
        : {}),
      ...(this.config.streamingConfigurations
        ? { streamingConfigurations: this.config.streamingConfigurations }
        : {}),
      ...(this.config.promptCreationConfigurations
        ? { promptCreationConfigurations: this.config.promptCreationConfigurations }
        : {}),
      ...(this.config.sourceArn ? { sourceArn: this.config.sourceArn } : {}),

      // Legacy configuration keys are retained for compatibility, but the SDK
      // omits these control-plane settings from InvokeAgent requests.
      ...(inferenceConfig && { inferenceConfig }),
      ...(this.config.guardrailConfiguration && {
        guardrailConfiguration: this.config.guardrailConfiguration,
      }),
      ...(this.config.promptOverrideConfiguration && {
        promptOverrideConfiguration: this.config.promptOverrideConfiguration as any,
      }),
      ...(this.config.actionGroups && {
        actionGroups: this.config.actionGroups as any,
      }),
      ...(this.config.inputDataConfig && {
        inputDataConfig: this.config.inputDataConfig as any,
      }),
    };

    logger.debug(`Invoking Bedrock agent ${this.config.agentId} with session ${sessionId}`);

    // Cache key based on agent ID and prompt (excluding volatile fields)
    const cache = await getCache();
    const useCache =
      isCacheEnabled() &&
      !this.config.sessionId &&
      !this.config.memoryId &&
      !this.config.endSession &&
      !this.config.sessionState?.returnControlInvocationResults;

    // Earlier cached results omitted KB overrides and could claim an unapplied guardrail.
    const cacheKey = `bedrock-agent:v3:${this.config.agentId}:${this.config.agentAliasId}:${this.getRegion()}:${sha256(
      JSON.stringify({
        prompt,
        actionGroups: this.config.actionGroups,
        enableTrace: this.config.enableTrace,
        endSession: this.config.endSession,
        guardrailConfiguration: this.config.guardrailConfiguration,
        inferenceConfig,
        inputDataConfig: this.config.inputDataConfig,
        knowledgeBaseConfigurations: this.config.knowledgeBaseConfigurations,
        memoryId: this.config.memoryId,
        promptOverrideConfiguration: this.config.promptOverrideConfiguration,
        sessionId: this.config.sessionId,
        sessionState: this.config.sessionState,
        bedrockModelConfigurations: this.config.bedrockModelConfigurations,
        streamingConfigurations: this.config.streamingConfigurations,
        promptCreationConfigurations: this.config.promptCreationConfigurations,
        sourceArn: this.config.sourceArn,
      }),
    )}`;

    // Check cache
    if (useCache) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached Bedrock Agents response');
        try {
          const parsed = JSON.parse(cached as string);
          // Validate the parsed cache data has expected structure
          if (parsed && typeof parsed === 'object') {
            const {
              sessionId: _sessionId,
              memoryId: _memoryId,
              ...metadata
            } = parsed.metadata ?? {};
            return {
              ...parsed,
              metadata,
              cached: true,
            };
          }
        } catch {
          logger.warn('Failed to parse cached Bedrock Agents response, ignoring cache');
        }
      }
    }

    try {
      // Invoke the agent
      const { InvokeAgentCommand } = await import('@aws-sdk/client-bedrock-agent-runtime');
      const response = await client.send(new InvokeAgentCommand(input));

      // Process the streaming response
      const result = await this.processResponse(response);

      // Cache the successful response
      if (useCache && !result.metadata?.returnControl) {
        try {
          const { sessionId: _sessionId, memoryId: _memoryId, ...metadata } = result.metadata ?? {};
          await cache.set(cacheKey, JSON.stringify({ ...result, metadata }));
        } catch (err) {
          logger.error(`Failed to cache response: ${err}`);
        }
      }

      return result;
    } catch (error: any) {
      logger.error(`Bedrock Agents invocation failed: ${error}`);

      // Provide helpful error messages
      if (error.name === 'ResourceNotFoundException') {
        return {
          error: `Agent or alias not found. Verify agentId: ${this.config.agentId} and agentAliasId: ${this.config.agentAliasId}`,
        };
      } else if (error.name === 'AccessDeniedException') {
        return {
          error: 'Access denied. Check IAM permissions for bedrock:InvokeAgent',
        };
      } else if (error.name === 'ValidationException') {
        return {
          error: `Invalid configuration: ${error.message}`,
        };
      } else if (error.name === 'ThrottlingException') {
        return {
          error: 'Rate limit exceeded. Please retry later.',
        };
      }

      return {
        error: `Failed to invoke agent: ${error.message || String(error)}`,
      };
    }
  }
}
