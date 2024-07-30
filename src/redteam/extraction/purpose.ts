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
    
    Given the above prompts, output the "system purpose" of the application in a single sentence, enclosed in <Purpose> tags.
    
    Example outputs:
    <Purpose>Provide users a way to manage finances</Purpose>
    <Purpose>Executive assistant that helps with scheduling and reminders</Purpose>
    <Purpose>Ecommerce chatbot that sells shoes</Purpose>
  `;

  return callExtraction(provider, prompt, (output: string) => {
    const match = output.match(/<Purpose>(.*?)<\/Purpose>/);
    return match ? match[1].trim() : output.trim();
  });
}
