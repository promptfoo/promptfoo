import { SUGGEST_PROMPTS_SYSTEM_MESSAGE } from './prompts/index';
import { DefaultSuggestionsProvider } from './providers/openai/defaults';
import { normalizeTokenUsage } from './util/tokenUsageUtils';

import type { TokenUsage } from './types/index';

interface GeneratePromptsOutput {
  prompts?: string[];
  error?: string;
  tokensUsed: TokenUsage;
}

export async function generatePrompts(
  prompt: string,
  _num: number,
): Promise<GeneratePromptsOutput> {
  const provider = DefaultSuggestionsProvider;

  const resp = await provider.callApi(
    JSON.stringify([
      SUGGEST_PROMPTS_SYSTEM_MESSAGE,
      {
        role: 'user',
        content: 'Generate a variant for the following prompt:',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]),
  );
  if (resp.error || !resp.output) {
    return {
      error: resp.error || 'Unknown error',
      tokensUsed: normalizeTokenUsage(resp.tokenUsage),
    };
  }

  try {
    return {
      prompts: [String(resp.output)],
      tokensUsed: normalizeTokenUsage(resp.tokenUsage),
    };
  } catch {
    return {
      error: `Output is not valid JSON: ${resp.output}`,
      tokensUsed: normalizeTokenUsage(resp.tokenUsage),
    };
  }
}
