import dedent from 'dedent';
import logger from '../../logger';
import { ApiProvider } from '../../types';

export abstract class ExtractionBase<T> {
  constructor(protected provider: ApiProvider) {}

  protected abstract generatePrompt(prompts: string[]): string;
  protected abstract processOutput(output: string): T;

  async extract(prompts: string[]): Promise<T> {
    const { output, error } = await this.provider.callApi(this.generatePrompt(prompts));

    if (error) {
      logger.error(`Error in extraction: ${error}`);
      throw new Error(`Failed to perform extraction: ${error}`);
    }

    if (typeof output !== 'string') {
      logger.error(`Invalid output from extraction. Got: ${output}`);
      throw new Error(`Invalid extraction output: expected string, got: ${output}`);
    }

    return this.processOutput(output);
  }

  protected formatPrompts(prompts: string[]): string {
    return prompts
      .map(
        (prompt) => dedent`
      <prompt>
      ${prompt}
      </prompt>`,
      )
      .join('\n');
  }
}
