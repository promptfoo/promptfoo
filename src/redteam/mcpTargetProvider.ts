import logger from '../logger';
import { MCPProvider } from '../providers/mcp';
import { accumulateAttackerTokenUsage, getErrorTokenUsage } from '../util/tokenUsageUtils';
import { materializeMcpToolCallRemote } from './extraction/util';
import { materializeMcpValue } from './mcpMaterialization';
import { redteamProviderManager } from './providers/shared';
import { getCloudTargetIdFromProviders } from './remoteGenerationContextFromProviders';

import type { MCPTool } from '../providers/mcp/types';
import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types';

const WRAPPED_MCP_PROVIDER = Symbol('wrappedMcpProvider');
type ProviderTokenUsage = NonNullable<ProviderResponse['tokenUsage']>;

type McpProviderWithTools = ApiProvider & {
  getAvailableTools: () => Promise<MCPTool[]>;
  [WRAPPED_MCP_PROVIDER]?: true;
};

function mergeMaterializationTokenUsage(
  response: ProviderResponse,
  materializationTokenUsage: Partial<ProviderTokenUsage> | undefined,
): ProviderResponse {
  if (!materializationTokenUsage) {
    return response;
  }

  const tokenUsage = { ...(response.tokenUsage ?? {}) };
  accumulateAttackerTokenUsage(tokenUsage, { tokenUsage: materializationTokenUsage });

  return {
    ...response,
    tokenUsage,
  };
}

function isRedteamTest(test: AtomicTestCase | undefined): boolean {
  return Boolean(test?.metadata?.pluginId || test?.metadata?.strategyId);
}

function isMcpProviderWithTools(provider: ApiProvider): provider is McpProviderWithTools {
  return provider instanceof MCPProvider && typeof provider.getAvailableTools === 'function';
}

class RedteamMcpTargetProvider implements ApiProvider {
  [WRAPPED_MCP_PROVIDER] = true as const;
  label?: string;
  config?: ApiProvider['config'];
  delay?: ApiProvider['delay'];
  transform?: ApiProvider['transform'];
  inputs?: ApiProvider['inputs'];

  private toolsPromise?: Promise<MCPTool[]>;
  private readonly cloudTargetId?: string;

  constructor(private readonly target: McpProviderWithTools) {
    this.label = target.label;
    this.config = target.config;
    this.delay = target.delay;
    this.transform = target.transform;
    this.inputs = target.inputs;
    this.cloudTargetId = getCloudTargetIdFromProviders({
      id: target.id(),
      config: target.config,
    });
  }

  id(): string {
    return this.target.id();
  }

  toString(): string {
    return this.target.toString?.() ?? this.id();
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const tools = await this.getTools();

    if (tools.length === 0) {
      return this.target.callApi(prompt, context, options);
    }

    let materializationTokenUsage: Partial<ProviderTokenUsage> | undefined;

    try {
      const intentValue =
        context?.test?.metadata?.goal ?? context?.test?.metadata?.originalPrompt ?? prompt;
      const purpose = String(context?.test?.metadata?.purpose ?? '');
      let materializedPrompt: string;
      try {
        materializedPrompt = await materializeMcpValue({
          intentValue,
          purpose,
          tools,
          value: prompt,
        });
      } catch (error) {
        logger.debug(
          `MCP target prompt requires inference materialization: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        const remoteMaterializedPrompt = await materializeMcpToolCallRemote(
          {
            intentValue,
            purpose,
            ...(this.cloudTargetId ? { targetId: this.cloudTargetId } : {}),
            tools,
            value: prompt,
          },
          options,
        ).catch((error: unknown) => {
          materializationTokenUsage = getErrorTokenUsage(error);
          throw error;
        });

        if (remoteMaterializedPrompt) {
          materializedPrompt = remoteMaterializedPrompt.prompt;
          materializationTokenUsage = remoteMaterializedPrompt.tokenUsage;
        } else {
          const materializerProvider = await redteamProviderManager.getProvider({
            jsonOnly: true,
          });
          const trackedMaterializerProvider = Object.create(materializerProvider) as ApiProvider;
          trackedMaterializerProvider.callApi = async (...args) => {
            try {
              const response = await materializerProvider.callApi(...args);
              if (response.cached && response.tokenUsage) {
                materializationTokenUsage = {
                  total: 0,
                  prompt: 0,
                  completion: 0,
                  cached: response.tokenUsage.cached ?? response.tokenUsage.total ?? 0,
                  numRequests: 0,
                };
              } else {
                materializationTokenUsage = response.tokenUsage;
              }
              return response;
            } catch (error) {
              materializationTokenUsage = getErrorTokenUsage(error);
              throw error;
            }
          };
          materializedPrompt = await materializeMcpValue({
            intentValue,
            provider: trackedMaterializerProvider,
            purpose,
            tools,
            value: prompt,
          });
        }
      }

      const materializedContext: CallApiContextParams | undefined = context
        ? {
            ...context,
            vars: {
              ...context.vars,
              prompt: materializedPrompt,
            },
          }
        : undefined;

      const response = await this.target.callApi(materializedPrompt, materializedContext, options);
      return mergeMaterializationTokenUsage(response, materializationTokenUsage);
    } catch (error) {
      const errorResponse: ProviderResponse = {
        error: `Failed to materialize MCP target prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
      return mergeMaterializationTokenUsage(errorResponse, materializationTokenUsage);
    }
  }

  async cleanup(): Promise<void> {
    await this.target.cleanup?.();
  }

  private getTools(): Promise<MCPTool[]> {
    this.toolsPromise ??= this.target.getAvailableTools();
    return this.toolsPromise;
  }
}

export function maybeWrapMcpProviderForRedteam(
  provider: ApiProvider,
  test: AtomicTestCase | undefined,
): ApiProvider {
  if (!isRedteamTest(test) || (provider as McpProviderWithTools)[WRAPPED_MCP_PROVIDER]) {
    return provider;
  }

  return isMcpProviderWithTools(provider) ? new RedteamMcpTargetProvider(provider) : provider;
}
