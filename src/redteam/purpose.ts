import dedent from 'dedent';
import invariant from 'tiny-invariant';
import { ApiProvider } from '../types';

export async function getPurpose(provider: ApiProvider, prompts: string[]): Promise<string> {
  const { output: purpose } = await provider.callApi(dedent`
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

  invariant(typeof purpose === 'string', `Expected purpose to be a string, got: ${purpose}`);
  return purpose;
}
