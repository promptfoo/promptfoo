import type {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type { Agent } from 'http';
import { getCache, isCacheEnabled } from '../../cache';
import { getEnvString, getEnvInt } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, ProviderResponse } from '../../types/providers';
import { AwsBedrockGenericProvider } from './index';

export interface BedrockKnowledgeBaseOptions {
  accessKeyId?: string;
  profile?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  knowledgeBaseId: string;
  modelArn?: string;
  // Additional parameters that affect the response
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
}

// Define citation types for metadata
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

    telemetry.record('feature_used', {
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
      if (getEnvString('HTTP_PROXY') || getEnvString('HTTPS_PROXY')) {
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
          maxAttempts: getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
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

  async callApi(prompt: string): Promise<ProviderResponse> {
    const client = await this.getKnowledgeBaseClient();

    // Prepare the request parameters
    let modelArn = this.kbConfig.modelArn;

    if (!modelArn) {
      if (this.modelName.includes('arn:aws:bedrock')) {
        modelArn = this.modelName; // Already has full ARN format
      } else if (
        this.modelName.startsWith('us.') ||
        this.modelName.startsWith('eu.') ||
        this.modelName.startsWith('apac.')
      ) {
        // This is a cross-region inference profile - use inference-profile ARN format
        // Note: We'll use the modelName directly as the inference profile ID since Knowledge Bases
        // expect the inference profile ID, not a full ARN for these
        modelArn = this.modelName;
      } else {
        // Regular foundation model
        modelArn = `arn:aws:bedrock:${this.getRegion()}::foundation-model/${this.modelName}`;
      }
    }

    const knowledgeBaseConfiguration: any = {
      knowledgeBaseId: this.kbConfig.knowledgeBaseId,
    };

    // Only include modelArn if explicitly configured or if it's a valid model
    if (this.kbConfig.modelArn || this.modelName !== 'default') {
      knowledgeBaseConfiguration.modelArn = modelArn;
    }

    const params: RetrieveAndGenerateCommandInput = {
      input: { text: prompt },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration,
      },
    };

    logger.debug(`Calling Amazon Bedrock Knowledge Base API: ${JSON.stringify(params)}`);

    const cache = await getCache();

    const sensitiveKeys = ['accessKeyId', 'secretAccessKey', 'sessionToken'];
    const cacheConfig = {
      region: this.getRegion(),
      modelName: this.modelName,
      ...Object.fromEntries(
        Object.entries(this.kbConfig).filter(([key]) => !sensitiveKeys.includes(key)),
      ),
    };

    const configStr = JSON.stringify(cacheConfig, Object.keys(cacheConfig).sort());
    const cacheKey = `bedrock-kb:${Buffer.from(configStr).toString('base64')}:${prompt}`;

    if (isCacheEnabled()) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}`);
        const parsedResponse = JSON.parse(cachedResponse as string);
        return {
          output: parsedResponse.output,
          metadata: { citations: parsedResponse.citations },
          tokenUsage: {},
          cached: true,
        };
      }
    }

    try {
      const { RetrieveAndGenerateCommand } = await import('@aws-sdk/client-bedrock-agent-runtime');
      const command = new RetrieveAndGenerateCommand(params);

      const response = await client.send(command);

      logger.debug(`Amazon Bedrock Knowledge Base API response: ${JSON.stringify(response)}`);

      let output = '';
      if (response && response.output && response.output.text) {
        output = response.output.text;
      }

      let citations: Citation[] = [];
      if (response && response.citations && Array.isArray(response.citations)) {
        citations = response.citations;
      }

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
        metadata: { citations },
        tokenUsage: {},
      };
    } catch (err) {
      return {
        error: `Bedrock Knowledge Base API error: ${String(err)}`,
      };
    }
  }
}
