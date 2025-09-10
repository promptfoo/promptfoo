import type { Agent } from 'http';

import { getCache, isCacheEnabled } from '../../cache';
import { getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { AwsBedrockGenericProvider } from './index';
import type {
  BedrockAgentRuntimeClient,
  InvokeAgentCommandInput,
  InvokeAgentCommandOutput,
  SessionState,
  InferenceConfig,
} from '@aws-sdk/client-bedrock-agent-runtime';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, ProviderResponse } from '../../types/providers';

/**
 * Configuration options for AWS Bedrock AgentCore provider
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html
 */
interface BedrockAgentCoreOptions {
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
  sessionState?: {
    sessionAttributes?: Record<string, string>;
    promptSessionAttributes?: Record<string, string>;
    returnControlInvocationResults?: Array<{
      functionResult?: {
        actionGroup: string;
        function?: string;
        responseBody?: Record<string, any>;
      };
      apiResult?: {
        actionGroup: string;
        apiPath?: string;
        httpMethod?: string;
        httpStatusCode?: number;
        responseBody?: Record<string, any>;
      };
    }>;
    invocationId?: string;
  };

  // Memory Configuration
  memoryId?: string;

  // Execution Configuration
  enableTrace?: boolean;
  endSession?: boolean;

  // Inference Configuration
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
    retrievalConfiguration?: {
      vectorSearchConfiguration: {
        numberOfResults?: number;
        overrideSearchType?: 'HYBRID' | 'SEMANTIC';
        filter?: Record<string, any>;
      };
    };
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
 * AWS Bedrock AgentCore provider for invoking deployed AI agents.
 * Supports all AgentCore features including memory, knowledge bases, action groups,
 * guardrails, and session management.
 *
 * @example Basic usage
 * ```yaml
 * providers:
 *   - bedrock:agentcore:AGENT_ID
 *     config:
 *       agentAliasId: PROD_ALIAS
 *       region: us-east-1
 * ```
 *
 * @example With memory and session
 * ```yaml
 * providers:
 *   - bedrock:agentcore:AGENT_ID
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
 *   - bedrock:agentcore:AGENT_ID
 *     config:
 *       agentAliasId: PROD_ALIAS
 *       guardrailConfiguration:
 *         guardrailId: GUARDRAIL_ID
 *         guardrailVersion: "1"
 *       inferenceConfig:
 *         temperature: 0.7
 *         topP: 0.9
 *         maximumLength: 2048
 * ```
 */
export class AwsBedrockAgentCoreProvider extends AwsBedrockGenericProvider implements ApiProvider {
  private agentRuntimeClient?: BedrockAgentRuntimeClient;
  config: BedrockAgentCoreOptions; // Make public to match base class

  constructor(
    agentId: string,
    options: { config?: BedrockAgentCoreOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(agentId, options);

    // Validate required fields
    if (!agentId && !options.config?.agentId) {
      throw new Error(
        'Agent ID is required. Provide it in the provider path (bedrock:agentcore:AGENT_ID) or config.',
      );
    }

    // Note: agentAliasId is validated in callApi to allow partial construction for testing
    this.config = {
      ...options.config,
      agentId: options.config?.agentId || agentId,
    } as BedrockAgentCoreOptions;

    // Record telemetry
    telemetry.record('feature_used', {
      feature: 'bedrock-agentcore',
      provider: 'bedrock',
    });
  }

  id(): string {
    return `bedrock:agentcore:${this.config.agentId}`;
  }

  toString(): string {
    return `[AWS Bedrock AgentCore Provider ${this.config.agentId}]`;
  }

  /**
   * Get or create the Bedrock Agent Runtime client
   */
  async getAgentRuntimeClient(): Promise<BedrockAgentRuntimeClient> {
    if (!this.agentRuntimeClient) {
      let handler;

      // Configure proxy if needed
      if (getEnvString('HTTP_PROXY') || getEnvString('HTTPS_PROXY')) {
        try {
          const { NodeHttpHandler } = await import('@smithy/node-http-handler');
          const { ProxyAgent } = await import('proxy-agent');
          handler = new NodeHttpHandler({
            httpsAgent: new ProxyAgent() as unknown as Agent,
          });
        } catch {
          throw new Error(
            'The @smithy/node-http-handler package is required for proxy support. Please install it.',
          );
        }
      }

      try {
        const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime');
        const credentials = await this.getCredentials();

        this.agentRuntimeClient = new BedrockAgentRuntimeClient({
          region: this.getRegion(),
          maxAttempts: getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
          retryMode: 'adaptive',
          ...(credentials ? { credentials } : {}),
          ...(handler ? { requestHandler: handler } : {}),
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
    if (!this.config.sessionState) {
      return undefined;
    }

    // Build session state according to AWS SDK types
    // Note: Using partial typing due to AWS SDK type constraints
    const sessionState: SessionState = {
      sessionAttributes: this.config.sessionState.sessionAttributes,
      promptSessionAttributes: this.config.sessionState.promptSessionAttributes,
      invocationId: this.config.sessionState.invocationId,
    } as SessionState;

    // Handle returnControlInvocationResults if present
    if (this.config.sessionState.returnControlInvocationResults) {
      (sessionState as any).returnControlInvocationResults =
        this.config.sessionState.returnControlInvocationResults;
    }

    return sessionState;
  }

  /**
   * Build inference configuration
   */
  private buildInferenceConfig(): InferenceConfig | undefined {
    if (!this.config.inferenceConfig) {
      return undefined;
    }

    // Build inference config according to AWS SDK types
    // Note: Using partial typing due to AWS SDK type constraints
    const inferenceConfig = {} as InferenceConfig;

    if (this.config.inferenceConfig.maximumLength !== undefined) {
      (inferenceConfig as any).maximumLength = this.config.inferenceConfig.maximumLength;
    }
    if (this.config.inferenceConfig.stopSequences !== undefined) {
      (inferenceConfig as any).stopSequences = this.config.inferenceConfig.stopSequences;
    }
    // Temperature, topP, topK may be model-specific
    if (this.config.inferenceConfig.temperature !== undefined) {
      (inferenceConfig as any).temperature = this.config.inferenceConfig.temperature;
    }
    if (this.config.inferenceConfig.topP !== undefined) {
      (inferenceConfig as any).topP = this.config.inferenceConfig.topP;
    }
    if (this.config.inferenceConfig.topK !== undefined) {
      (inferenceConfig as any).topK = this.config.inferenceConfig.topK;
    }

    return inferenceConfig;
  }

  /**
   * Process the streaming response from the agent
   */
  private async processResponse(response: InvokeAgentCommandOutput): Promise<{
    output: string;
    trace?: any;
    sessionId?: string;
  }> {
    let output = '';
    const traces: any[] = [];

    if (response.completion) {
      const decoder = new TextDecoder();

      try {
        for await (const event of response.completion) {
          // Process text chunks
          if (event.chunk?.bytes) {
            output += decoder.decode(event.chunk.bytes, { stream: true });
          }

          // Collect trace information if enabled
          if (this.config.enableTrace && event.trace) {
            traces.push(event.trace);
          }
        }

        // Final decode to flush any remaining bytes
        output += decoder.decode();
      } catch (error) {
        logger.error(`Error processing agent response stream: ${error}`);
        throw error;
      }
    }

    return {
      output,
      trace: traces.length > 0 ? traces : undefined,
      sessionId: response.sessionId,
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

    const client = await this.getAgentRuntimeClient();

    // Generate session ID if not provided
    const sessionId =
      this.config.sessionId ||
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `session-${crypto.randomUUID()}`
        : `session-${Date.now()}-${process.hrtime.bigint().toString(36)}`);

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

      // Advanced configurations - using type assertions for preview features
      // The AWS SDK types may not be fully up to date with all AgentCore features
      // These configurations are validated by AWS at runtime
      ...(this.config.inferenceConfig && {
        inferenceConfig: this.buildInferenceConfig(),
      }),
      ...(this.config.guardrailConfiguration && {
        guardrailConfiguration: this.config.guardrailConfiguration,
      }),
      ...(this.config.promptOverrideConfiguration && {
        promptOverrideConfiguration: this.config.promptOverrideConfiguration as any,
      }),
      ...(this.config.knowledgeBaseConfigurations && {
        knowledgeBaseConfigurations: this.config.knowledgeBaseConfigurations as any,
      }),
      ...(this.config.actionGroups && {
        actionGroups: this.config.actionGroups as any,
      }),
      ...(this.config.inputDataConfig && {
        inputDataConfig: this.config.inputDataConfig as any,
      }),
    };

    logger.debug(`Invoking AgentCore agent ${this.config.agentId} with session ${sessionId}`);

    // Cache key based on agent ID and prompt (excluding volatile fields)
    const cache = await getCache();
    const cacheKey = `bedrock:agentcore:${this.config.agentId}:${JSON.stringify({
      prompt,
      inferenceConfig: this.config.inferenceConfig,
      knowledgeBaseConfigurations: this.config.knowledgeBaseConfigurations,
    })}`;

    // Check cache
    if (isCacheEnabled()) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached AgentCore response');
        try {
          const parsed = JSON.parse(cached as string);
          // Validate the parsed cache data has expected structure
          if (parsed && typeof parsed === 'object') {
            return {
              ...parsed,
              cached: true,
            };
          }
        } catch {
          logger.warn('Failed to parse cached AgentCore response, ignoring cache');
        }
      }
    }

    try {
      // Invoke the agent
      const { InvokeAgentCommand } = await import('@aws-sdk/client-bedrock-agent-runtime');
      const response = await client.send(new InvokeAgentCommand(input));

      // Process the streaming response
      const { output, trace, sessionId: responseSessionId } = await this.processResponse(response);

      // Build the result
      const result: ProviderResponse = {
        output,
        metadata: {
          ...(responseSessionId && { sessionId: responseSessionId }),
          ...(trace && { trace }),
          ...(this.config.memoryId && { memoryId: this.config.memoryId }),
          ...(this.config.guardrailConfiguration && {
            guardrails: {
              applied: true,
              guardrailId: this.config.guardrailConfiguration.guardrailId,
              guardrailVersion: this.config.guardrailConfiguration.guardrailVersion,
            },
          }),
        },
      };

      // Cache the successful response
      if (isCacheEnabled()) {
        try {
          await cache.set(cacheKey, JSON.stringify(result));
        } catch (err) {
          logger.error(`Failed to cache response: ${err}`);
        }
      }

      return result;
    } catch (error: any) {
      logger.error(`AgentCore invocation failed: ${error}`);

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
