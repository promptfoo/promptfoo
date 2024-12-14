import type { KnowledgeBaseRetrievalResult } from '@aws-sdk/client-bedrock-agent-runtime';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { getEnvString } from '../envars';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from '../types';

interface BedrockKnowledgeBaseOptions {
  maxResults?: number;
  vectorSearchConfiguration?: {
    numberOfResults?: number;
    overrideSearchType?: string;
  };
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export class BedrockKnowledgeBaseProvider implements ApiProvider {
  private knowledgeBaseId: string;
  private config: BedrockKnowledgeBaseOptions;
  public label?: string;
  public transform?: string;
  public delay?: number;
  private sessionId?: string;

  constructor(
    knowledgeBaseId: string,
    options: { config?: BedrockKnowledgeBaseOptions; label?: string } = {},
  ) {
    this.knowledgeBaseId = knowledgeBaseId;
    this.config = options.config || {};
    this.label = options.label;
    this.sessionId = `bedrock-kb-${Date.now()}`;
  }

  id(): string {
    return `bedrock:knowledge-base:${this.knowledgeBaseId}`;
  }

  getSessionId(): string {
    return this.sessionId || '';
  }

  private async getCredentials(): Promise<
    AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined
  > {
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      return {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken,
      };
    }
    return undefined;
  }

  private getRegion(): string {
    return this.config?.region || getEnvString('AWS_BEDROCK_REGION') || 'us-east-1';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      const { BedrockAgentRuntimeClient, RetrieveCommand } = await import(
        '@aws-sdk/client-bedrock-agent-runtime'
      );
      const credentials = await this.getCredentials();
      const client = new BedrockAgentRuntimeClient({
        region: this.getRegion(),
        ...(credentials ? { credentials } : {}),
      });

      const command = new RetrieveCommand({
        knowledgeBaseId: this.knowledgeBaseId,
        retrievalQuery: { text: prompt },
        ...(this.config?.vectorSearchConfiguration && {
          vectorSearchConfiguration: this.config.vectorSearchConfiguration,
        }),
      });

      const response = await client.send(command);

      if (!response.retrievalResults?.length) {
        return {
          output: '',
          tokenUsage: undefined,
          sessionId: this.sessionId,
        };
      }

      const results = response.retrievalResults
        .filter(
          (result): result is KnowledgeBaseRetrievalResult & { content: { text: string } } =>
            result?.content?.text !== undefined,
        )
        .map((result) => result.content.text);

      return {
        output: results.join('\n'),
        tokenUsage: undefined,
        sessionId: this.sessionId,
      };
    } catch (err) {
      return {
        error: `Knowledge Base API call error: ${String(err)}`,
        sessionId: this.sessionId,
      };
    }
  }
}
