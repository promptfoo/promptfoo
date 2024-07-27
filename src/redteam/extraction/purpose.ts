import dedent from 'dedent';
import { ApiProvider } from '../../types';
import { ExtractionBase } from './base';

export class SystemPurposeExtractor extends ExtractionBase<string> {
  protected generatePrompt(prompts: string[]): string {
    return dedent`
      The following are prompts that are being used to test an LLM application:
      
      ${this.formatPrompts(prompts)}
      
      Given the above prompts, output the "system purpose" of the application in a single sentence.
      
      Example outputs:
      - Provide users a way to manage finances
      - Executive assistant that helps with scheduling and reminders
      - Ecommerce chatbot that sells shoes
    `;
  }

  protected processOutput(output: string): string {
    return output.trim();
  }
}

export async function extractSystemPurpose(
  provider: ApiProvider,
  prompts: string[],
): Promise<string> {
  const extractor = new SystemPurposeExtractor(provider);
  return extractor.extract(prompts);
}
