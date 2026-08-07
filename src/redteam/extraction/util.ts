import dedent from 'dedent';
import { z } from 'zod';
import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../../providers/shared';
import invariant from '../../util/invariant';
import { normalizeMcpToolCall, stringifyMcpToolCall } from '../mcpToolCall';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  shouldGenerateRemote,
} from '../remoteGeneration';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';

import type {
  ApiProvider,
  CallApiOptionsParams,
  ProviderResponse,
  RemoteGenerationContext,
} from '../../types/index';
import type { McpToolDefinition } from '../mcpToolCall';

export const RedTeamGenerationResponse = z.object({
  task: z.string(),
  result: z.union([z.string(), z.array(z.string())]),
});

export type RedTeamTask = 'purpose' | 'entities';

interface PromptfooMcpMaterializationOptions {
  intentValue?: unknown;
  purpose?: string;
  targetId?: string;
  redteamGenerationContext?: RemoteGenerationContext;
  tools: McpToolDefinition[];
  value: unknown;
}

/**
 * Fetches remote generation results for a given task and prompts.
 *
 * @param task - The type of task to perform ('purpose' or 'entities').
 * @param prompts - An array of prompts to process.
 * @param generationContext - Resolved target context for routing the remote task.
 * @returns A Promise that resolves to either a string or an array of strings, depending on the task.
 * @throws Will throw an error if the remote generation fails.
 *
 * @example
 * ```typescript
 * const result = await fetchRemoteGeneration('purpose', ['What is the purpose of this app?']);
 * console.log(result); // Outputs the generated purpose as a string
 * ```
 */
export async function fetchRemoteGeneration(
  task: RedTeamTask,
  prompts: string[],
  generationContext?: RemoteGenerationContext,
): Promise<string | string[]> {
  invariant(
    !getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION'),
    'fetchRemoteGeneration should never be called when remote generation is disabled',
  );
  try {
    const body = {
      task,
      prompts,
      version: VERSION,
      email: getUserEmail(),
      ...remoteGenerationContextPayload(generationContext),
    };

    const response = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: getRemoteGenerationHeaders(),
        body: JSON.stringify(body),
      },
      getRequestTimeoutMs(),
      'json',
    );

    const parsedResponse = RedTeamGenerationResponse.parse(response.data);
    return parsedResponse.result;
  } catch (error) {
    logger.warn(`Error using remote generation for task '${task}': ${error}`);
    throw error;
  }
}

export async function materializeMcpToolCallRemote(
  options: PromptfooMcpMaterializationOptions,
  callApiOptions?: CallApiOptionsParams,
): Promise<{ prompt: string; tokenUsage?: ProviderResponse['tokenUsage'] } | undefined> {
  if (!shouldGenerateRemote()) {
    return undefined;
  }

  const body = {
    email: getUserEmail(),
    jsonOnly: true,
    mcpMaterializationContext: {
      intentValue: options.intentValue,
      purpose: options.purpose,
      tools: options.tools,
    },
    preferSmallModel: false,
    prompt: typeof options.value === 'string' ? options.value : JSON.stringify(options.value),
    task: 'mcp-materialization',
    version: VERSION,
    ...remoteGenerationContextPayload(options.redteamGenerationContext ?? options.targetId),
  };

  try {
    const response = await fetchWithCache<{
      result?: unknown;
      tokenUsage?: ProviderResponse['tokenUsage'];
    }>(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: getRemoteGenerationHeaders(),
        body: JSON.stringify(body),
        ...(callApiOptions?.abortSignal && { signal: callApiOptions.abortSignal }),
      },
      getRequestTimeoutMs(),
      'json',
      true,
    );

    if (response.status !== 200) {
      throw new Error(`API call failed with status ${response.status}: ${response.statusText}`);
    }

    const toolCall = normalizeMcpToolCall(response.data.result, options.tools);

    if (!toolCall) {
      throw new Error('Remote MCP materialization did not return a valid tool call');
    }

    return {
      prompt: stringifyMcpToolCall(toolCall),
      tokenUsage: response.data.tokenUsage,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    throw new Error(`Remote MCP materialization failed: ${String(err)}`);
  }
}

export async function callExtraction<T>(
  provider: ApiProvider,
  prompt: string,
  processOutput: (output: string) => T,
): Promise<T> {
  const { output, error } = await provider.callApi(
    JSON.stringify([{ role: 'user', content: prompt }]),
  );

  if (error) {
    logger.error(`Error in extraction: ${error}`);
    throw new Error(`Failed to perform extraction: ${error}`);
  }

  if (typeof output !== 'string') {
    logger.error(`Invalid output from extraction. Got: ${output}`);
    throw new Error(`Invalid extraction output: expected string, got: ${output}`);
  }

  return processOutput(output);
}

export function formatPrompts(prompts: string[]): string {
  return prompts
    .map(
      (prompt) => dedent`
    <Prompt>
    ${prompt}
    </Prompt>`,
    )
    .join('\n');
}
