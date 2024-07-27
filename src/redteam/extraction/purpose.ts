import dedent from 'dedent';
import { ApiProvider } from '../../types';
import { callExtraction, formatPrompts } from './util';

export async function extractSystemPurpose(
  provider: ApiProvider,
  prompts: string[],
): Promise<string> {
  const prompt = dedent`
    The following are prompts that are being used to test an LLM application:
    
    ${formatPrompts(prompts)}
    
    Given the above prompts, output the "system purpose" of the application in a single sentence.
    
    Example outputs:
    - Provide users a way to manage finances
    - Executive assistant that helps with scheduling and reminders
    - Ecommerce chatbot that sells shoes
  `;

  return callExtraction(provider, prompt, (output: string) => output.trim());
}
