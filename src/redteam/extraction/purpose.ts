import dedent from 'dedent';
import type { ApiProvider } from '../../types';
import { extractJsonObjects } from '../../util/json';
import { callExtraction, formatPrompts } from './util';

export async function extractSystemPurpose(
  provider: ApiProvider,
  prompts: string[],
): Promise<string> {
  const prompt = dedent`
    The following are prompts that are being used to test an LLM application:
    
    ${formatPrompts(prompts)}
    
    Given the above prompts, output the "system purpose" of the application in a single sentence.
    Your response should be a valid JSON object with a single key "purpose" and the sentence as its value.
    
    Example outputs:
    {"purpose": "Provide users a way to manage finances"}
    {"purpose": "Executive assistant that helps with scheduling and reminders"}
    {"purpose": "Ecommerce chatbot that sells shoes"}
  `;

  const output = await callExtraction(provider, prompt);

  try {
    const parsedOutput = extractJsonObjects(output)[0] as { purpose: string };
    if (typeof parsedOutput.purpose !== 'string') {
      throw new Error('Invalid JSON format');
    }
    console.error(`Extracted purpose: ${parsedOutput.purpose}`);
    return parsedOutput.purpose.trim();
  } catch (error) {
    console.error('Failed to parse purpose from JSON:', error);
    return output.trim();
  }
}
