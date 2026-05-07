import logger from '../logger';
import { MCPProvider } from '../providers/mcp';
import { materializeMcpValue } from './mcpMaterialization';
import { redteamProviderManager } from './providers/shared';

import type { MCPTool } from '../providers/mcp/types';
import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types';

const WRAPPED_MCP_PROVIDER = Symbol('wrappedMcpProvider');

type McpProviderWithTools = ApiProvider & {
  getAvailableTools: () => Promise<MCPTool[]>;
  [WRAPPED_MCP_PROVIDER]?: true;
};

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

  constructor(private readonly target: McpProviderWithTools) {
    this.label = target.label;
    this.config = target.config;
    this.delay = target.delay;
    this.transform = target.transform;
    this.inputs = target.inputs;
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

        const materializerProvider = await redteamProviderManager.getProvider({ jsonOnly: true });
        materializedPrompt = await materializeMcpValue({
          intentValue,
          provider: materializerProvider,
          purpose,
          tools,
          value: prompt,
        });
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

      return this.target.callApi(materializedPrompt, materializedContext, options);
    } catch (error) {
      return {
        error: `Failed to materialize MCP target prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
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
