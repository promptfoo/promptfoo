import dedent from 'dedent';
import logger from '../../logger';
import { ApiProvider } from '../../types';

/**
 * Abstract base class for extraction operations.
 * @template T The type of data to be extracted.
 */
export abstract class ExtractionBase<T> {
  /**
   * Creates an instance of ExtractionBase.
   * @param provider The API provider used for extraction.
   */
  constructor(protected provider: ApiProvider) {}

  /**
   * Generates a prompt for the extraction operation.
   * @param prompts An array of input prompts.
   * @returns A string representing the generated prompt.
   */
  protected abstract generatePrompt(prompts: string[]): string;

  /**
   * Processes the output from the API call.
   * @param output The raw output string from the API call.
   * @returns The processed data of type T.
   */
  protected abstract processOutput(output: string): T;

  /**
   * Performs the extraction operation.
   * @param prompts An array of input prompts.
   * @returns A promise that resolves to the extracted data of type T.
   * @throws Will throw an error if the extraction fails or if the output is invalid.
   */
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

  /**
   * Formats an array of prompts into a string.
   * @param prompts An array of input prompts.
   * @returns A formatted string containing all prompts.
   */
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
