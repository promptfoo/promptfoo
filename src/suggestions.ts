import { SUGGEST_PROMPTS_SYSTEM_MESSAGE } from './prompts/index';
import { getDefaultProviders } from './providers/defaults';
import {
  accumulateTokenUsage,
  createEmptyTokenUsage,
  normalizeTokenUsage,
} from './util/tokenUsageUtils';

import type { TokenUsage } from './types/index';

interface GeneratePromptsOutput {
  prompts?: string[];
  error?: string;
  tokensUsed: TokenUsage;
}

export async function generatePrompts(prompt: string, num: number): Promise<GeneratePromptsOutput> {
  const provider = (await getDefaultProviders()).suggestionsProvider;
  const prompts: string[] = [];
  const tokensUsed = createEmptyTokenUsage();

  for (let i = 0; i < num; i++) {
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
    const tokenUsage = normalizeTokenUsage(resp.tokenUsage);
    accumulateTokenUsage(tokensUsed, tokenUsage);
    if (resp.error || !resp.output) {
      return {
        error: resp.error || 'Unknown error',
        tokensUsed,
      };
    }

    try {
      prompts.push(String(resp.output));
    } catch {
      return {
        error: `Output is not valid JSON: ${resp.output}`,
        tokensUsed,
      };
    }
  }

  return { prompts, tokensUsed };
}
