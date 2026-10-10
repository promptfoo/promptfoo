import { getCache, isCacheEnabled } from '../../cache';
import { getEnvInt } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { isSamplingParamsDeprecatedClaudeModel } from '../anthropic/util';
import { AwsBedrockGenericProvider } from './base';
import { assertBedrockModelIsAvailable } from './index';
import { isValidBedrockRetrievalFilter } from './retrievalFilter';
import {
  createBedrockRequestHandler,
  hashBedrockConfig,
  hasProxyEnv,
  INFERENCE_PROFILE_PREFIX,
} from './util';
import type {
  BedrockAgentRuntimeClient,
  GenerationConfiguration,
  KnowledgeBaseRetrieveAndGenerateConfiguration,
  RetrieveAndGenerateCommandInput,
  RetrieveAndGenerateCommandOutput,
  RetrieveAndGenerateStreamCommandOutput,
  RetrieveCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, ProviderResponse } from '../../types/providers';

interface BedrockKnowledgeBaseOptions {
  accessKeyId?: string;
  apiKey?: string;
  profile?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  knowledgeBaseId?: string;
  modelArn?: string;
  // Additional parameters that affect the response
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  numberOfResults?: number;
  operation?: 'retrieveAndGenerate' | 'retrieve';
  streaming?: boolean;
  retrievalConfiguration?: KnowledgeBaseRetrieveAndGenerateConfiguration['retrievalConfiguration'];
  generationConfiguration?: KnowledgeBaseRetrieveAndGenerateConfiguration['generationConfiguration'];
  orchestrationConfiguration?: KnowledgeBaseRetrieveAndGenerateConfiguration['orchestrationConfiguration'];
  retrieveAndGenerateConfiguration?: RetrieveAndGenerateCommandInput['retrieveAndGenerateConfiguration'];
  sessionId?: RetrieveAndGenerateCommandInput['sessionId'];
  sessionConfiguration?: RetrieveAndGenerateCommandInput['sessionConfiguration'];
  userContext?: RetrieveAndGenerateCommandInput['userContext'];
  guardrailConfiguration?: RetrieveCommandInput['guardrailConfiguration'];
  nextToken?: RetrieveCommandInput['nextToken'];
}

/**
 * AWS Bedrock Knowledge Base provider for RAG (Retrieval Augmented Generation).
 * Allows querying an existing AWS Bedrock Knowledge Base with text queries.
 */
export class AwsBedrockKnowledgeBaseProvider
  extends AwsBedrockGenericProvider
  implements ApiProvider
{
  knowledgeBaseClient?: BedrockAgentRuntimeClient;
  private singleAttemptKnowledgeBaseClient?: BedrockAgentRuntimeClient;
  kbConfig: BedrockKnowledgeBaseOptions;

  constructor(
    modelName: string,
    options: { config?: BedrockKnowledgeBaseOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    assertBedrockModelIsAvailable(options.config?.modelArn || modelName);

    // Ensure we have a knowledgeBaseId
    if (!options.config?.knowledgeBaseId && !options.config?.retrieveAndGenerateConfiguration) {
      throw new Error(
        'Knowledge Base ID is required. Please provide a knowledgeBaseId in the provider config.',
      );
    }

    this.kbConfig = options.config || { knowledgeBaseId: '' };

    telemetry.record('feature_used', {
      feature: 'knowledge_base',
      provider: 'bedrock',
    });
  }

  id(): string {
    const id =
      this.kbConfig.knowledgeBaseId ??
      this.kbConfig.retrieveAndGenerateConfiguration?.knowledgeBaseConfiguration?.knowledgeBaseId;
    if (id) {
      return `bedrock:kb:${id}`;
    }
    return `bedrock:kb:external:${hashBedrockConfig(this.kbConfig.retrieveAndGenerateConfiguration)}`;
  }

  toString(): string {
    return `[Amazon Bedrock Knowledge Base Provider ${this.kbConfig.knowledgeBaseId ?? this.id()}]`;
  }

  async getKnowledgeBaseClient() {
    const singleAttempt =
      this.kbConfig.operation !== 'retrieve' &&
      Boolean(this.kbConfig.sessionId || this.kbConfig.streaming);
    const clientProperty = singleAttempt
      ? 'singleAttemptKnowledgeBaseClient'
      : 'knowledgeBaseClient';
    if (!this[clientProperty]) {
      // Use a custom handler when a proxy is configured. Agent Runtime requires SigV4.
      const handler = hasProxyEnv() ? await createBedrockRequestHandler() : undefined;

      try {
        const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime');
        const credentials = await this.getCredentials(false);
        const client = new BedrockAgentRuntimeClient({
          region: this.getRegion(),
          // The SDK caches retry strategies; session continuations need a separate client.
          maxAttempts: singleAttempt ? 1 : getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
          retryMode: 'adaptive',
          ...(handler ? { requestHandler: handler } : {}),
          ...(credentials ? { credentials } : {}),
        });
        this[clientProperty] = client;
      } catch (err) {
        throw new Error(
          `The @aws-sdk/client-bedrock-agent-runtime package is required as a peer dependency. Please install it in your project or globally. Error: ${err}`,
        );
      }
    }

    return this[clientProperty];
  }

  private buildGenerationConfiguration(modelArn: string): GenerationConfiguration | undefined {
    const { max_tokens } = this.kbConfig;
    const { temperature, top_p, top_k } = isSamplingParamsDeprecatedClaudeModel(modelArn)
      ? {}
      : this.kbConfig;
    // Sonnet 4.5/4.6 and Haiku 4.5 accept either temperature or top_p. Prefer top_p, as
    // the Anthropic Messages provider does, without changing older models.
    const omitTemperature =
      top_p !== undefined &&
      /(^|[^a-z0-9])claude-(?:sonnet-4-[56]|haiku-4-5)(?![0-9])/i.test(modelArn);
    const textInferenceConfig = {
      ...(temperature !== undefined && !omitTemperature && { temperature }),
      ...(max_tokens !== undefined && { maxTokens: max_tokens }),
      ...(top_p !== undefined && { topP: top_p }),
    };
    const additionalModelRequestFields: GenerationConfiguration['additionalModelRequestFields'] =
      top_k === undefined
        ? undefined
        : /(^|[/.])amazon\.nova-/.test(modelArn)
          ? { inferenceConfig: { topK: top_k } }
          : /(^|[/.])cohere\.command-r(?:-plus)?-v\d+(?::\d+)?$/.test(modelArn)
            ? { k: top_k }
            : { top_k };
    if (Object.keys(textInferenceConfig).length > 0 || additionalModelRequestFields) {
      return {
        ...(Object.keys(textInferenceConfig).length > 0
          ? { inferenceConfig: { textInferenceConfig } }
          : {}),
        ...(additionalModelRequestFields ? { additionalModelRequestFields } : {}),
      };
    }

    return undefined;
  }

  private buildRetrievalConfiguration() {
    const native = this.kbConfig.retrievalConfiguration;
    if (this.kbConfig.numberOfResults === undefined) {
      return native;
    }
    if (native?.managedSearchConfiguration) {
      return {
        ...native,
        managedSearchConfiguration: {
          ...native.managedSearchConfiguration,
          numberOfResults: this.kbConfig.numberOfResults,
        },
      };
    }
    return {
      ...native,
      vectorSearchConfiguration: {
        ...native?.vectorSearchConfiguration,
        numberOfResults: this.kbConfig.numberOfResults,
      },
    };
  }

  private async retrieve(prompt: string): Promise<ProviderResponse> {
    const { RetrieveCommand } = await import('@aws-sdk/client-bedrock-agent-runtime');
    const client = await this.getKnowledgeBaseClient();
    const response = await client.send(
      new RetrieveCommand({
        knowledgeBaseId: this.kbConfig.knowledgeBaseId,
        retrievalQuery: { text: prompt },
        retrievalConfiguration: this.buildRetrievalConfiguration(),
        guardrailConfiguration: this.kbConfig.guardrailConfiguration,
        nextToken: this.kbConfig.nextToken,
        userContext: this.kbConfig.userContext,
      }),
    );
    return {
      output: JSON.stringify(response.retrievalResults ?? []),
      metadata: {
        retrievalResults: response.retrievalResults,
        ...(response.nextToken ? { nextToken: response.nextToken } : {}),
        ...(response.guardrailAction ? { guardrailAction: response.guardrailAction } : {}),
      },
      ...(response.guardrailAction === 'INTERVENED'
        ? { guardrails: { flagged: true, reason: 'INTERVENED' } }
        : {}),
      tokenUsage: { numRequests: 1 },
    };
  }

  private async collectStream(
    response: RetrieveAndGenerateStreamCommandOutput,
  ): Promise<RetrieveAndGenerateCommandOutput> {
    if (!response.stream) {
      throw new Error('Bedrock returned no RetrieveAndGenerate stream');
    }
    const collected: RetrieveAndGenerateCommandOutput = {
      $metadata: response.$metadata,
      sessionId: response.sessionId,
      output: { text: '' },
      citations: [],
    };
    for await (const event of response.stream) {
      const failure = Object.entries(event).find(([key]) => key.endsWith('Exception'));
      if (failure) {
        throw new Error(
          `${failure[0]}: ${(failure[1] as { message?: string }).message ?? 'Bedrock stream failed'}`,
        );
      }
      if (event.output?.text) {
        collected.output!.text += event.output.text;
      }
      if (event.citation) {
        const { citation, generatedResponsePart, retrievedReferences } = event.citation;
        collected.citations!.push(citation ?? { generatedResponsePart, retrievedReferences });
      }
      if (event.guardrail?.action) {
        collected.guardrailAction = event.guardrail.action;
      }
    }
    return collected;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    try {
      const retrieval =
        this.kbConfig.operation === 'retrieve' || !this.kbConfig.retrieveAndGenerateConfiguration
          ? this.kbConfig.retrievalConfiguration
          : this.kbConfig.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration
              ?.retrievalConfiguration;
      const filters = [
        retrieval?.vectorSearchConfiguration?.filter,
        retrieval?.managedSearchConfiguration?.filter,
      ];
      if (
        filters.some((filter) => filter !== undefined && !isValidBedrockRetrievalFilter(filter))
      ) {
        return {
          error:
            'Invalid Knowledge Base retrieval filter: use an AWS RetrievalFilter with one operator, such as equals, or andAll/orAll with at least two operands. Flat metadata maps are not supported.',
        };
      }
      if (this.kbConfig.operation === 'retrieve') {
        if (!this.kbConfig.knowledgeBaseId) {
          return { error: 'Retrieve requires config.knowledgeBaseId.' };
        }
        return await this.retrieve(prompt);
      }
      if (
        !this.kbConfig.retrieveAndGenerateConfiguration &&
        !this.kbConfig.modelArn &&
        (!this.modelName || this.modelName === 'default')
      ) {
        return {
          error:
            'A generation model is required for Bedrock Knowledge Bases. Set bedrock:kb:<model-id> or provide config.modelArn.',
        };
      }
      const client = await this.getKnowledgeBaseClient();
      const region = this.getRegion();
      const partition = region.startsWith('cn-')
        ? 'aws-cn'
        : region.startsWith('us-gov-')
          ? 'aws-us-gov'
          : 'aws';
      const modelArn =
        this.kbConfig.modelArn ||
        (/^arn:aws(?:-[^:]+)?:bedrock:/.test(this.modelName) ||
        INFERENCE_PROFILE_PREFIX.test(this.modelName)
          ? this.modelName
          : `arn:${partition}:bedrock:${region}::foundation-model/${this.modelName}`);
      const generationConfiguration =
        this.kbConfig.generationConfiguration ?? this.buildGenerationConfiguration(modelArn);
      const retrievalConfiguration = this.buildRetrievalConfiguration();
      const knowledgeBaseConfiguration: KnowledgeBaseRetrieveAndGenerateConfiguration = {
        knowledgeBaseId: this.kbConfig.knowledgeBaseId,
        modelArn,
        ...(generationConfiguration ? { generationConfiguration } : {}),
        ...(retrievalConfiguration ? { retrievalConfiguration } : {}),
        ...(this.kbConfig.orchestrationConfiguration
          ? { orchestrationConfiguration: this.kbConfig.orchestrationConfiguration }
          : {}),
      };
      let nativeConfig = this.kbConfig.retrieveAndGenerateConfiguration;
      if (nativeConfig?.externalSourcesConfiguration) {
        const external = nativeConfig.externalSourcesConfiguration;
        nativeConfig = {
          ...nativeConfig,
          externalSourcesConfiguration: {
            ...external,
            sources: external.sources?.map((source) => ({
              ...source,
              ...(source.byteContent
                ? {
                    byteContent: {
                      ...source.byteContent,
                      data:
                        typeof source.byteContent.data === 'string'
                          ? Buffer.from(source.byteContent.data, 'base64')
                          : source.byteContent.data,
                    },
                  }
                : {}),
            })),
          },
        };
      }
      const params: RetrieveAndGenerateCommandInput = {
        input: { text: prompt },
        retrieveAndGenerateConfiguration: nativeConfig ?? {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration,
        },
        ...(this.kbConfig.sessionId ? { sessionId: this.kbConfig.sessionId } : {}),
        ...(this.kbConfig.sessionConfiguration
          ? { sessionConfiguration: this.kbConfig.sessionConfiguration }
          : {}),
        ...(this.kbConfig.userContext ? { userContext: this.kbConfig.userContext } : {}),
      };

      const cache = await getCache();
      // Explicit sessions and streaming requests must reach AWS. A cached session response
      // cannot advance the service's conversation state.
      const useCache =
        isCacheEnabled() &&
        !this.kbConfig.sessionId &&
        !this.kbConfig.streaming &&
        !this.getApiKey();
      const sensitiveKeys = ['accessKeyId', 'secretAccessKey', 'sessionToken', 'apiKey'];
      const cacheKey = useCache
        ? `bedrock-kb:v3:${this.kbConfig.knowledgeBaseId}:${modelArn}:${region}:${hashBedrockConfig(
            {
              config: {
                region,
                modelName: this.modelName,
                ...Object.fromEntries(
                  Object.entries(this.kbConfig).filter(([key]) => !sensitiveKeys.includes(key)),
                ),
              },
              prompt,
            },
          )}`
        : '';
      if (useCache) {
        const cached = await cache.get(cacheKey);
        if (cached) {
          logger.debug('Returning cached Bedrock Knowledge Base response');
          const parsed = JSON.parse(cached as string);
          const { sessionId: _sessionId, ...cachedMetadata } = parsed.metadata ?? {
            citations: parsed.citations,
          };
          return {
            output: parsed.output,
            metadata: cachedMetadata,
            ...(parsed.guardrails ? { guardrails: parsed.guardrails } : {}),
            tokenUsage: createEmptyTokenUsage(),
            cached: true,
          };
        }
      }
      const { RetrieveAndGenerateCommand, RetrieveAndGenerateStreamCommand } = await import(
        '@aws-sdk/client-bedrock-agent-runtime'
      );
      const response = this.kbConfig.streaming
        ? await this.collectStream(await client.send(new RetrieveAndGenerateStreamCommand(params)))
        : await client.send(new RetrieveAndGenerateCommand(params));
      const result: ProviderResponse = {
        output: response.output?.text ?? '',
        metadata: {
          citations: response.citations ?? [],
          ...(response.sessionId ? { sessionId: response.sessionId } : {}),
          ...(response.guardrailAction ? { guardrailAction: response.guardrailAction } : {}),
        },
        ...(response.guardrailAction === 'INTERVENED'
          ? { guardrails: { flagged: true, reason: 'INTERVENED' } }
          : {}),
        tokenUsage: { ...createEmptyTokenUsage(), numRequests: 1 },
      };
      if (useCache) {
        try {
          // Cached output is reusable, but the service session belongs to this live call.
          const { sessionId: _sessionId, ...metadata } = result.metadata ?? {};
          await cache.set(cacheKey, JSON.stringify({ ...result, metadata }));
        } catch (err) {
          logger.error('Failed to cache knowledge base response', { error: String(err) });
        }
      }
      return result;
    } catch (err) {
      return { error: `Bedrock Knowledge Base API error: ${String(err)}` };
    }
  }
}
