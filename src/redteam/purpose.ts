import dedent from 'dedent';
import logger from '../logger';
import { ApiProvider } from '../types';

export async function getPurpose(provider: ApiProvider, prompts: string[]): Promise<string> {
  const { output: purpose, error } = await provider.callApi(dedent`
      The following are prompts that are being used to test an LLM application:
      
      ${prompts
        .map(
          (prompt) => dedent`
        <prompt>
        ${prompt}
        </prompt>`,
        )
        .join('\n')}
      
      Given the above prompts, output the "system purpose" of the application in a single sentence.
      
      Example outputs:
      - Provide users a way to manage finances
      - Executive assistant that helps with scheduling and reminders
      - Ecommerce chatbot that sells shoes
    `);

  if (error) {
    logger.error(`Error determining system purpose: ${error}`);
    throw new Error(`Failed to determine system purpose: ${error}`);
  } else if (typeof purpose !== 'string') {
    logger.error(`Could not determine system purpose. Got: ${purpose}`);
    throw new Error(`Invalid system purpose: expected string, got: ${purpose}`);
  }
  return purpose;
}
