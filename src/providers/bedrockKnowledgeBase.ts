import type {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type { Agent } from 'http';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import telemetry from '../telemetry';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderResponse } from '../types/providers';
import { AwsBedrockGenericProvider } from './bedrock';

export interface BedrockKnowledgeBaseOptions {
  accessKeyId?: string;
  profile?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  knowledgeBaseId: string;
  modelArn?: string;
}

// Define citation types to extend ProviderResponse
export interface CitationReference {
  content?: {
    text?: string;
    [key: string]: any;
  };
  location?: {
    type?: string;
    s3Location?: {
      uri?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface Citation {
  retrievedReferences?: CitationReference[];
  generatedResponsePart?: {
    textResponsePart?: {
      text?: string;
      span?: {
        start?: number;
        end?: number;
      };
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface BedrockKnowledgeBaseResponse extends ProviderResponse {
  citations?: Citation[];
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
  kbConfig: BedrockKnowledgeBaseOptions;

  constructor(
    modelName: string,
    options: { config?: BedrockKnowledgeBaseOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);

    // Ensure we have a knowledgeBaseId
    if (!options.config?.knowledgeBaseId) {
      throw new Error(
        'Knowledge Base ID is required. Please provide a knowledgeBaseId in the provider config.',
      );
    }

    this.kbConfig = options.config || { knowledgeBaseId: '' };

    telemetry.recordAndSendOnce('feature_used', {
      feature: 'knowledge_base',
      provider: 'bedrock',
    });
  }

  id(): string {
    return `bedrock:kb:${this.kbConfig.knowledgeBaseId}`;
  }

  toString(): string {
    return `[Amazon Bedrock Knowledge Base Provider ${this.kbConfig.knowledgeBaseId}]`;
  }

  async getKnowledgeBaseClient() {
    if (!this.knowledgeBaseClient) {
      let handler;
      // set from https://www.npmjs.com/package/proxy-agent
      if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
        try {
          const { NodeHttpHandler } = await import('@smithy/node-http-handler');
          const { ProxyAgent } = await import('proxy-agent');
          handler = new NodeHttpHandler({
            httpsAgent: new ProxyAgent() as unknown as Agent,
          });
        } catch {
          throw new Error(
            `The @smithy/node-http-handler package is required as a peer dependency. Please install it in your project or globally.`,
          );
        }
      }

      try {
        const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime');
        const credentials = await this.getCredentials();
        const client = new BedrockAgentRuntimeClient({
          region: this.getRegion(),
          maxAttempts: Number(process.env.AWS_BEDROCK_MAX_RETRIES || '10'),
          retryMode: 'adaptive',
          ...(credentials ? { credentials } : {}),
          ...(handler ? { requestHandler: handler } : {}),
        });
        this.knowledgeBaseClient = client;
      } catch (err) {
        throw new Error(
          `The @aws-sdk/client-bedrock-agent-runtime package is required as a peer dependency. Please install it in your project or globally. Error: ${err}`,
        );
      }
    }

    return this.knowledgeBaseClient;
  }

  async callApi(prompt: string): Promise<BedrockKnowledgeBaseResponse> {
    const client = await this.getKnowledgeBaseClient();

    // Prepare the request parameters
    const modelArn =
      this.kbConfig.modelArn ||
      (this.modelName.includes(':')
        ? this.modelName // If modelName already has full ARN format, use as is
        : `arn:aws:bedrock:${this.getRegion()}:aws:foundation-model/${this.modelName}`);

    const params: RetrieveAndGenerateCommandInput = {
      input: { text: prompt },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: this.kbConfig.knowledgeBaseId,
          modelArn,
        },
      },
    };

    logger.debug(`Calling Amazon Bedrock Knowledge Base API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `bedrock-kb:${this.kbConfig.knowledgeBaseId}:${this.modelName}:${prompt}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}`);
        const parsedResponse = JSON.parse(cachedResponse as string);
        return {
          output: parsedResponse.output,
          citations: parsedResponse.citations,
          tokenUsage: {},
          cached: true,
        };
      }
    }

    try {
      // Import the command here to ensure it's only loaded when needed
      const { RetrieveAndGenerateCommand } = await import('@aws-sdk/client-bedrock-agent-runtime');
      const command = new RetrieveAndGenerateCommand(params);

      const response = await client.send(command);

      logger.debug(`Amazon Bedrock Knowledge Base API response: ${JSON.stringify(response)}`);

      // Extract output from response
      let output = '';
      if (response && response.output && response.output.text) {
        output = response.output.text;
      }

      // Extract citations from response
      let citations: Citation[] = [];
      if (response && response.citations && Array.isArray(response.citations)) {
        citations = response.citations;
      }

      // Cache the response
      if (isCacheEnabled()) {
        try {
          await cache.set(
            cacheKey,
            JSON.stringify({
              output,
              citations,
            }),
          );
        } catch (err) {
          logger.error(`Failed to cache knowledge base response: ${String(err)}`);
        }
      }

      return {
        output,
        citations,
        tokenUsage: {},
      };
    } catch (err) {
      // For error cases, return only the error property without other fields
      return {
        error: `Bedrock Knowledge Base API error: ${String(err)}`,
      } as BedrockKnowledgeBaseResponse;
    }
  }
}
