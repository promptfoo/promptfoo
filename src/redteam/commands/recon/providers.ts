import dedent from 'dedent';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { ReconOutputSchema } from './schema';
import type { ProviderChoice, ReconResult, Scratchpad } from './types';

/**
 * Abstract provider interface for recon analysis
 */
export interface ReconProvider {
  analyze(directory: string, prompt: string): Promise<ReconResult>;
}

/**
 * Creates an OpenAI Codex SDK provider for recon
 */
export async function createOpenAIReconProvider(
  directory: string,
  scratchpad: Scratchpad,
  model?: string,
): Promise<ReconProvider> {
  const { OpenAICodexSDKProvider } = await import('../../../providers/openai/codex-sdk');

  const provider = new OpenAICodexSDKProvider({
    config: {
      working_dir: directory,
      additional_directories: [scratchpad.dir],
      skip_git_repo_check: true,
      model: model || 'gpt-5.1-codex',
      output_schema: ReconOutputSchema,
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
): Promise<ReconProvider> {
  const { ClaudeCodeSDKProvider } = await import('../../../providers/claude-agent-sdk');

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
 * Parses the raw output from the agent into a ReconResult
 */
function parseReconOutput(output: unknown): ReconResult {
  if (typeof output === 'string') {
    try {
      return JSON.parse(output);
    } catch {
      // If it's not JSON, treat the string as the purpose
      return { purpose: output };
    }
  }
  if (output && typeof output === 'object') {
    return output as ReconResult;
  }
  throw new Error('Invalid recon output: expected JSON object');
}
