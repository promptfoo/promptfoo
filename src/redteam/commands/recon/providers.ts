import dedent from 'dedent';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { ReconResultSchema } from '../../../validators/recon';
import { ReconOutputSchema } from './schema';

import type { ProviderChoice, ReconResult, Scratchpad } from './types';

/**
 * Callback for streaming progress events during analysis
 */
export type ReconProgressCallback = (event: { type: string; message: string }) => void;

/**
 * Abstract provider interface for recon analysis
 */
export interface ReconProvider {
  analyze(directory: string, prompt: string): Promise<ReconResult>;
}

/**
 * Formats a Codex event into a human-readable message
 */
function formatCodexEvent(event: any): string | null {
  if (!event?.item) {
    return null;
  }

  const item = event.item;
  switch (item.type) {
    case 'command_execution':
      // Extract the command being run
      if (item.call?.command) {
        const cmd = item.call.command;
        // Truncate long commands
        const display = cmd.length > 60 ? `${cmd.substring(0, 57)}...` : cmd;
        return `Running: ${display}`;
      }
      return 'Running command...';
    case 'file_change':
      return item.path ? `Editing: ${item.path}` : 'Editing file...';
    case 'mcp_tool_call':
      return item.tool ? `Calling tool: ${item.tool}` : 'Calling tool...';
    case 'web_search':
      return 'Searching web...';
    case 'agent_message':
      // Skip agent messages (final output)
      return null;
    case 'reasoning':
      return 'Thinking...';
    default:
      return null;
  }
}

/**
 * Creates an OpenAI Codex SDK provider for recon
 */
export async function createOpenAIReconProvider(
  directory: string,
  scratchpad: Scratchpad,
  model?: string,
  onProgress?: ReconProgressCallback,
): Promise<ReconProvider> {
  const { OpenAICodexSDKProvider } = await import('../../../providers/openai/codex-sdk');

  const provider = new OpenAICodexSDKProvider({
    config: {
      working_dir: directory,
      additional_directories: [scratchpad.dir],
      skip_git_repo_check: true,
      model: model || 'gpt-5.1-codex',
      output_schema: ReconOutputSchema,
      enable_streaming: !!onProgress,
      on_event: onProgress
        ? (event: any) => {
            const message = formatCodexEvent(event);
            if (message) {
              onProgress({ type: event.type, message });
            }
          }
        : undefined,
    },
  });

  return {
    async analyze(_dir: string, prompt: string): Promise<ReconResult> {
      const response = await provider.callApi(prompt);
      if (response.error) {
        throw new Error(`OpenAI Codex SDK error: ${response.error}`);
      }
      return parseReconOutput(response.output);
    },
  };
}

/**
 * Creates a Claude Agent SDK provider for recon
 */
export async function createAnthropicReconProvider(
  directory: string,
  scratchpad: Scratchpad,
  model?: string,
  onProgress?: ReconProgressCallback,
): Promise<ReconProvider> {
  const { ClaudeCodeSDKProvider } = await import('../../../providers/claude-agent-sdk');

  // Build hooks for progress updates if callback provided
  const hooks = onProgress
    ? {
        PreToolUse: [
          {
            hooks: [
              async (input: any) => {
                const toolName = input?.tool_name;
                if (toolName) {
                  let message = `Using ${toolName}`;
                  // Add more detail for specific tools
                  if (toolName === 'Read' && input?.tool_input?.file_path) {
                    message = `Reading: ${input.tool_input.file_path}`;
                  } else if (toolName === 'Grep' && input?.tool_input?.pattern) {
                    message = `Searching for: ${input.tool_input.pattern}`;
                  } else if (toolName === 'Glob' && input?.tool_input?.pattern) {
                    message = `Finding files: ${input.tool_input.pattern}`;
                  } else if (toolName === 'WebFetch') {
                    message = 'Fetching web content...';
                  } else if (toolName === 'WebSearch') {
                    message = 'Searching web...';
                  }
                  onProgress({ type: 'tool', message });
                }
                return { continue: true };
              },
            ],
          },
        ],
      }
    : undefined;

  const provider = new ClaudeCodeSDKProvider({
    config: {
      working_dir: directory,
      additional_directories: [scratchpad.dir],
      model: model || 'opus',
      max_budget_usd: 25.0,
      append_allowed_tools: ['WebFetch', 'WebSearch'],
      permission_mode: 'acceptEdits', // Allow writing to scratchpad
      output_format: {
        type: 'json_schema',
        schema: ReconOutputSchema,
      },
      hooks,
    },
  });

  return {
    async analyze(_dir: string, prompt: string): Promise<ReconResult> {
      const response = await provider.callApi(prompt);
      if (response.error) {
        throw new Error(`Claude Agent SDK error: ${response.error}`);
      }
      return parseReconOutput(response.output);
    },
  };
}

/**
 * Selects the appropriate provider based on available API keys
 *
 * Priority: OpenAI first, then Anthropic
 */
export function selectProvider(forcedProvider?: 'openai' | 'anthropic'): ProviderChoice {
  if (forcedProvider === 'openai') {
    if (!getEnvString('OPENAI_API_KEY') && !getEnvString('CODEX_API_KEY')) {
      throw new Error('OPENAI_API_KEY or CODEX_API_KEY required for OpenAI provider');
    }
    return { type: 'openai', model: 'gpt-5.1-codex' };
  }

  if (forcedProvider === 'anthropic') {
    if (!getEnvString('ANTHROPIC_API_KEY')) {
      throw new Error('ANTHROPIC_API_KEY required for Anthropic provider');
    }
    return { type: 'anthropic', model: 'opus' };
  }

  // Auto-detect: prefer OpenAI
  if (getEnvString('OPENAI_API_KEY') || getEnvString('CODEX_API_KEY')) {
    logger.info('Using OpenAI Codex SDK (OPENAI_API_KEY detected)');
    return { type: 'openai', model: 'gpt-5.1-codex' };
  }

  if (getEnvString('ANTHROPIC_API_KEY')) {
    logger.info('Using Claude Agent SDK (ANTHROPIC_API_KEY detected)');
    return { type: 'anthropic', model: 'opus' };
  }

  throw new Error(dedent`
    No API key found. Please set one of:
    - OPENAI_API_KEY or CODEX_API_KEY for OpenAI Codex SDK
    - ANTHROPIC_API_KEY for Claude Agent SDK
  `);
}

/**
 * Parses the raw output from the agent into a ReconResult.
 * Uses Zod validation to ensure type safety.
 *
 * @internal Exported for testing
 */
export function parseReconOutput(output: unknown): ReconResult {
  let parsed: unknown = output;

  // If string, try to parse as JSON
  if (typeof output === 'string') {
    try {
      parsed = JSON.parse(output);
    } catch {
      // If it's not JSON, treat the string as the purpose
      return { purpose: output };
    }
  }

  // Validate against schema
  const result = ReconResultSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  // Log validation errors but attempt to return partial result
  logger.warn('Recon output validation failed, using raw output', {
    errors: result.error.flatten().fieldErrors,
  });

  // Fall back to type assertion if object (for partial compatibility)
  // Arrays are technically objects in JS, but not valid ReconResults
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as ReconResult;
  }

  throw new Error('Invalid recon output: expected JSON object');
}
