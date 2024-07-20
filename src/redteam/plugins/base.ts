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

  constructor(
    protected provider: ApiProvider,
    protected purpose: string,
    protected injectVar: string,
  ) {
    logger.debug(`PluginBase initialized with purpose: ${purpose}, injectVar: ${injectVar}`);
  }

  protected abstract getAssertions(prompt: string): Assertion[];

  /**
   * Generates a batch of prompts.
   *
   * @param batchN - The number of prompts to generate in this batch.
   * @returns A promise that resolves to an array of generated prompts.
   */
  protected async generateBatch(batchN: number): Promise<string[]> {
    logger.debug(`Generating batch of ${batchN} prompts`);
    const nunjucks = getNunjucksEngine();
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
  }

  async generateTests(n: number): Promise<TestCase[]> {
    logger.debug(`Generating ${n} test cases`);
    const batchSize = 20;
    const uniquePrompts = new Set<string>();
    let consecutiveRetries = 0;
    const maxConsecutiveRetries = 2;

    while (uniquePrompts.size < n && consecutiveRetries <= maxConsecutiveRetries) {
      const remainingPrompts = n - uniquePrompts.size;
      const batchN = Math.min(remainingPrompts, batchSize);
      const newPrompts = await this.generateBatch(batchN);

      const initialSize = uniquePrompts.size;
      newPrompts.forEach((prompt) => uniquePrompts.add(prompt));

      const addedPrompts = uniquePrompts.size - initialSize;
      logger.debug(`Added ${addedPrompts} unique prompts. Total: ${uniquePrompts.size}`);

      if (addedPrompts === 0) {
        consecutiveRetries++;
        logger.debug(`No new unique prompts. Consecutive retries: ${consecutiveRetries}`);
      } else {
        consecutiveRetries = 0;
      }
    }

    let allPrompts = Array.from(uniquePrompts);

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
