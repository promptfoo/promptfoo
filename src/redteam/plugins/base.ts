import invariant from 'tiny-invariant';
import logger from '../../logger';
import type { ApiProvider, Assertion, TestCase } from '../../types';
import { getNunjucksEngine } from '../../util/templates';

/**
 * Randomly samples n items from an array.
 *
 * @param array The array to sample from
 * @param n The number of items to sample
 * @returns A new array with n randomly sampled items
 */
export function sampleArray<T>(array: T[], n: number): T[] {
  logger.debug(`Sampling ${n} items from array of length ${array.length}`);
  const shuffled = array.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

export async function retryWithDeduplication<T>(
  operation: (currentItems: T[]) => Promise<T[]>,
  targetCount: number,
  maxConsecutiveRetries: number = 2,
  dedupFn: (items: T[]) => T[] = (items) => Array.from(new Set(items)),
): Promise<T[]> {
  const allItems: T[] = [];
  let consecutiveRetries = 0;

  while (allItems.length < targetCount && consecutiveRetries <= maxConsecutiveRetries) {
    const newItems = await operation(allItems);
    const uniqueNewItems = dedupFn([...allItems, ...newItems]).slice(allItems.length);
    allItems.push(...uniqueNewItems);

    logger.debug(`Added ${uniqueNewItems.length} unique items. Total: ${allItems.length}`);

    if (uniqueNewItems.length === 0) {
      consecutiveRetries++;
      logger.debug(`No new unique items. Consecutive retries: ${consecutiveRetries}`);
    } else {
      consecutiveRetries = 0;
    }
  }

  return allItems;
}

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

    const generateBatch = async (remainingCount: number) => {
      const currentBatchSize = Math.min(remainingCount, batchSize);
      return this.generateBatch(currentBatchSize);
    };

    const allPrompts = await retryWithDeduplication(
      async (currentItems: string[]) => {
        const remainingCount = n - currentItems.length;
        return generateBatch(remainingCount);
      },
      n,
      2,
      (items) => Array.from(new Set(items)),
    );

    // If we have more prompts than requested, randomly sample to get exact number
    const finalPrompts = allPrompts.length > n ? sampleArray(allPrompts, n) : allPrompts;

    logger.debug(`Generating test cases from ${finalPrompts.length} prompts`);
    return finalPrompts.map((prompt) => ({
      vars: {
        [this.injectVar]: prompt,
      },
      assert: this.getAssertions(prompt),
    }));
  }
}
