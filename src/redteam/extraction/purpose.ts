import dedent from 'dedent';
import { fetchWithCache } from '../../cache';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { ApiProvider } from '../../types';
import { RedTeamGenerationResponse } from './common';
import { callExtraction, formatPrompts } from './util';

export async function extractSystemPurpose(
  provider: ApiProvider,
  prompts: string[],
): Promise<string> {
  const useRemoteGeneration = !getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION', false);

  if (useRemoteGeneration) {
    try {
      const url = 'https://us-central1-promptfoo.cloudfunctions.net/generate';
      const body = {
        task: 'purpose',
        prompts: prompts,
      };

      const response = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );

      const parsedResponse = RedTeamGenerationResponse.parse(response.data);
      return parsedResponse.result as string;
    } catch (error) {
      logger.warn(`Error using remote generation, falling back to local extraction: ${error}`);
    }
  }

  // Fallback to local extraction
  const prompt = dedent`
    The following are prompts that are being used to test an LLM application:
    
    ${formatPrompts(prompts)}
    
    Given the above prompts, output the "system purpose" of the application in a single sentence, enclosed in <Purpose> tags.
    
    Example outputs:
    <Purpose>Provide users a way to manage finances</Purpose>
    <Purpose>Executive assistant that helps with scheduling and reminders</Purpose>
    <Purpose>Ecommerce chatbot that sells shoes</Purpose>
  `;

  return await callExtraction(provider, prompt, (output: string) => {
    const match = output.match(/<Purpose>(.*?)<\/Purpose>/);
    return match ? match[1].trim() : output.trim();
  });
}
