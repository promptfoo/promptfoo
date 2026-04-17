/**
 * AWS Bedrock Base Provider
 *
 * Contains the abstract base class for all Bedrock providers.
 * This is extracted to avoid circular dependency issues.
 */

import type { Agent } from 'http';

import { getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type { BedrockRuntime, Trace } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';

import type { EnvOverrides } from '../../types/env';

export interface BedrockOptions {
  accessKeyId?: string;
  apiKey?: string;
  profile?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  guardrailIdentifier?: string;
  guardrailVersion?: string;
  trace?: Trace;
  showThinking?: boolean;
  endpoint?: string;
}

export abstract class AwsBedrockGenericProvider {
  modelName: string;
  env?: EnvOverrides;
  bedrock?: BedrockRuntime;
  config: BedrockOptions;

  constructor(
    modelName: string,
    options: { config?: BedrockOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;

    if (this.config.guardrailIdentifier) {
      telemetry.record('feature_used', {
        feature: 'guardrail',
        provider: 'bedrock',
      });
    }
  }

  id(): string {
    return `bedrock:${this.modelName}`;
  }

  toString(): string {
    return `[Amazon Bedrock Provider ${this.modelName}]`;
  }

  protected getApiKey(): string | undefined {
    return this.config.apiKey || getEnvString('AWS_BEARER_TOKEN_BEDROCK');
  }

  async getCredentials(): Promise<
    AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined
  > {
    // 1. Explicit credentials have ABSOLUTE highest priority (as documented)
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      logger.debug(`Using credentials from config file`);
      return {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken,
      };
    }

    // 2. API key authentication as second priority
    const apiKey = this.getApiKey();
    if (apiKey) {
      logger.debug(`Using Bedrock API key authentication`);
      // For Bedrock API keys, we don't need traditional AWS credentials
      // The API key will be handled in the request headers
      return undefined;
    }

    // 3. SSO profile as third priority
    if (this.config.profile) {
      logger.debug(`Using SSO profile: ${this.config.profile}`);
      try {
        const { fromSSO } = await import('@aws-sdk/credential-provider-sso');
        return fromSSO({ profile: this.config.profile });
      } catch (err) {
        logger.error(`Error loading @aws-sdk/credential-provider-sso: ${err}`);
        throw new Error(
          'The @aws-sdk/credential-provider-sso package is required for SSO profiles. Please install it: npm install @aws-sdk/credential-provider-sso',
        );
      }
    }

    // 4. AWS default credential chain (lowest priority)
    logger.debug(`No explicit credentials in config, falling back to AWS default chain`);
    return undefined;
  }

  async getBedrockInstance() {
    if (!this.bedrock) {
      let handler;
      const apiKey = this.getApiKey();

      // Create request handler for proxy or API key scenarios
      if (getEnvString('HTTP_PROXY') || getEnvString('HTTPS_PROXY') || apiKey) {
        try {
          const { NodeHttpHandler } = await import('@smithy/node-http-handler');
          const { ProxyAgent } = await import('proxy-agent');

          // Create handler with proxy support if needed
          const proxyAgent =
            getEnvString('HTTP_PROXY') || getEnvString('HTTPS_PROXY')
              ? new ProxyAgent()
              : undefined;

          handler = new NodeHttpHandler({
            ...(proxyAgent ? { httpsAgent: proxyAgent as unknown as Agent } : {}),
            requestTimeout: 300000, // 5 minutes
          });

          // Add Bearer token middleware for API key authentication
          if (apiKey) {
            const originalHandle = handler.handle.bind(handler);
            handler.handle = async (request: any, options?: any) => {
              // Add Authorization header with Bearer token
              request.headers = {
                ...request.headers,
                Authorization: `Bearer ${apiKey}`,
              };
              return originalHandle(request, options);
            };
          }
        } catch {
          const reason = apiKey
            ? 'API key authentication requires the @smithy/node-http-handler package'
            : 'Proxy configuration requires the @smithy/node-http-handler package';
          throw new Error(`${reason}. Please install it in your project or globally.`);
        }
      }

      try {
        const { BedrockRuntime } = await import('@aws-sdk/client-bedrock-runtime');
        const credentials = await this.getCredentials();

        const bedrock = new BedrockRuntime({
          region: this.getRegion(),
          maxAttempts: getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
          retryMode: 'adaptive',
          ...(credentials ? { credentials } : {}),
          ...(handler ? { requestHandler: handler } : {}),
          ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
        });

        this.bedrock = bedrock;
      } catch (err) {
        logger.error(`Error creating BedrockRuntime: ${err}`);
        throw new Error(
          'The @aws-sdk/client-bedrock-runtime package is required as a peer dependency. Please install it in your project or globally.',
        );
      }
    }
    return this.bedrock;
  }

  getRegion(): string {
    return (
      this.config?.region ||
      this.env?.AWS_BEDROCK_REGION ||
      getEnvString('AWS_BEDROCK_REGION') ||
      'us-east-1'
    );
  }
}
