import invariant from 'tiny-invariant';
import logger from '../../logger';
import type { ApiProvider, Assertion, TestCase } from '../../types';
import { getNunjucksEngine } from '../../util/templates';
import { retryWithDeduplication, sampleArray } from '../util';

/**
 * Abstract base class for creating plugins that generate test cases.
 */
export default abstract class PluginBase {
  /**
   * Template string used to generate prompts.
   */
  protected abstract template: string;

  /**
   * Creates an instance of PluginBase.
   * @param provider - The API provider used for generating prompts.
   * @param purpose - The purpose of the plugin.
   * @param injectVar - The variable name to inject the generated prompt into.
   */
  constructor(
    protected provider: ApiProvider,
    protected purpose: string,
    protected injectVar: string,
  ) {
    logger.debug(`PluginBase initialized with purpose: ${purpose}, injectVar: ${injectVar}`);
  }

  /**
   * Abstract method to get assertions for a given prompt.
   * @param prompt - The prompt to generate assertions for.
   * @returns An array of Assertion objects.
   */
  protected abstract getAssertions(prompt: string): Assertion[];

  /**
   * Generates test cases based on the plugin's configuration.
   * @param n - The number of test cases to generate.
   * @returns A promise that resolves to an array of TestCase objects.
   */
  async generateTests(n: number): Promise<TestCase[]> {
    logger.debug(`Generating ${n} test cases`);
    const batchSize = 20;

    /**
     * Generates a batch of prompts using the API provider.
     * @param currentPrompts - The current list of prompts.
     * @returns A promise that resolves to an array of new prompts.
     */
    const generatePrompts = async (currentPrompts: string[]): Promise<string[]> => {
      const remainingCount = n - currentPrompts.length;
      const currentBatchSize = Math.min(remainingCount, batchSize);
      logger.debug(`Generating batch of ${currentBatchSize} prompts`);

      const nunjucks = getNunjucksEngine();
      const { output: generatedPrompts } = await this.provider.callApi(
        nunjucks.renderString(this.template, {
          purpose: this.purpose,
          n: currentBatchSize,
        }),
      );

      invariant(typeof generatedPrompts === 'string', 'Expected generatedPrompts to be a string');
      return generatedPrompts
        .split('\n')
        .filter((line: string) => line.includes('Prompt:'))
        .map((line: string) => line.substring(line.indexOf('Prompt:') + 'Prompt:'.length).trim());
    };
    const allPrompts = await retryWithDeduplication(generatePrompts, n);
    const prompts = sampleArray(allPrompts, n);
    logger.debug(`Generating test cases from ${prompts.length} prompts`);
    return prompts.sort().map((prompt) => ({
      vars: {
        [this.injectVar]: prompt,
      },
      assert: this.getAssertions(prompt),
    }));
  }
}
