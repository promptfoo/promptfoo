import dedent from 'dedent';
import logger from '../../logger';
import type { ApiProvider } from '../../types';
import { shouldGenerateRemote } from '../remoteGeneration';
import type { RedTeamTask } from './util';
import { callExtraction, fetchRemoteGeneration, formatPrompts } from './util';

export async function extractSystemPurpose(
  provider: ApiProvider,
  prompts: string[],
): Promise<string> {
  if (shouldGenerateRemote()) {
    try {
      const result = await fetchRemoteGeneration('purpose' as RedTeamTask, prompts);
      return result as string;
    } catch (error) {
      logger.warn(`[purpose] Error using remote generation, returning empty string: ${error}`);
      return '';
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

  try {
    return callExtraction(provider, prompt, (output: string) => {
      const match = output.match(/<Purpose>(.*?)<\/Purpose>/);
      return match ? match[1].trim() : output.trim();
    });
  } catch (error) {
    logger.warn(`[purpose] Error using extracting purpose, returning empty string: ${error}`);
    return '';
  }
}
