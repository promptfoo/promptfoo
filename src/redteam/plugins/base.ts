import invariant from 'tiny-invariant';
import logger from '../../logger';
import type { ApiProvider, Assertion, TestCase } from '../../types';
import { getNunjucksEngine } from '../../util/templates';

/**
 * Abstract base class for creating plugins that generate test cases.
 */
export default abstract class PluginBase {
  /**
   * Template string used to generate prompts.
   */
  protected abstract template: string;

  /**
   * Constructs a new PluginBase instance.
   *
   * @param provider - The API provider used to call the API.
   * @param purpose - The purpose of the system being tested.
   * @param injectVar - The variable to inject into the test cases.
   */
  constructor(
    protected provider: ApiProvider,
    protected purpose: string,
    protected injectVar: string,
  ) {
    logger.debug(`PluginBase initialized with purpose: ${purpose}, injectVar: ${injectVar}`);
  }

  /**
   * Abstract method to get the assertion for a given prompt.
   *
   * @param prompt - The prompt for which to get the assertion.
   * @returns The assertion object.
   */
  protected abstract getAssertions(prompt: string): Assertion[];

  /**
   * Generates test cases based on the provided template, purpose, and number of prompts.
   *
   * @param n - The number of prompts to generate.
   * @returns A promise that resolves to an array of test cases.
   */
  async generateTests(n: number): Promise<TestCase[]> {
    logger.debug(`Generating ${n} test cases`);
    const nunjucks = getNunjucksEngine();
    const batchSize = 20;
    let allPrompts: string[] = [];
    let consecutiveRetries = 0;
    const maxConsecutiveRetries = 2;

    const generateBatch = async (batchN: number): Promise<string[]> => {
      logger.debug(`Generating batch of ${batchN} prompts`);
      const { output: generatedPrompts } = await this.provider.callApi(
        nunjucks.renderString(this.template, {
          purpose: this.purpose,
          n: batchN,
        }),
      );
      invariant(typeof generatedPrompts === 'string', 'Expected generatedPrompts to be a string');
      const prompts = generatedPrompts
        .split('\n')
        .filter((line) => line.includes('Prompt:'))
        .map((line) => line.substring(line.indexOf('Prompt:') + 'Prompt:'.length).trim());
      logger.debug(`Generated ${prompts.length} prompts in this batch`);
      return prompts;
    };

    while (allPrompts.length < n && consecutiveRetries <= maxConsecutiveRetries) {
      const remainingPrompts = n - allPrompts.length;
      const batchN = Math.min(remainingPrompts, batchSize);
      const newPrompts = await generateBatch(batchN);

      const uniqueNewPrompts = newPrompts.filter((prompt) => !allPrompts.includes(prompt));
      allPrompts.push(...uniqueNewPrompts);

      logger.debug(`Added ${uniqueNewPrompts.length} unique prompts. Total: ${allPrompts.length}`);

      if (uniqueNewPrompts.length === 0) {
        consecutiveRetries++;
        logger.debug(`No new unique prompts. Consecutive retries: ${consecutiveRetries}`);
      } else {
        consecutiveRetries = 0;
      }
    }

    // If we have more prompts than requested, randomly sample to get exact number
    if (allPrompts.length > n) {
      logger.debug(`Sampling ${n} prompts from ${allPrompts.length} total prompts`);
      allPrompts = this.sampleArray(allPrompts, n);
    }

    logger.debug(`Generating test cases from ${allPrompts.length} prompts`);
    return allPrompts.map((prompt) => ({
      vars: {
        [this.injectVar]: prompt,
      },
      assert: this.getAssertions(prompt),
    }));
  }

  private sampleArray<T>(array: T[], n: number): T[] {
    logger.debug(`Sampling ${n} items from array of length ${array.length}`);
    const shuffled = array.slice().sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
  }
}
