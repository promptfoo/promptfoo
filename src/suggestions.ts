import { SUGGEST_PROMPTS_SYSTEM_MESSAGE } from './prompts';
import { DefaultSuggestionsProvider } from './providers/openai';
import type { TokenUsage } from './types';

interface GeneratePromptsOutput {
  prompts?: string[];
  error?: string;
  tokensUsed: TokenUsage;
}

export async function generatePrompts(prompt: string, num: number): Promise<GeneratePromptsOutput> {
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
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        completionDetails: resp.tokenUsage?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  }

  try {
    return {
      prompts: [String(resp.output)],
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        completionDetails: resp.tokenUsage?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  } catch {
    return {
      error: `Output is not valid JSON: ${resp.output}`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        completionDetails: resp.tokenUsage?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  }
}
