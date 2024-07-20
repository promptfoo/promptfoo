import invariant from 'tiny-invariant';
import logger from '../../logger';
import type { ApiProvider, Assertion, TestCase } from '../../types';
import { sampleArray } from '../../util';
import { getNunjucksEngine } from '../../util/templates';

/**
 * Retries an operation with deduplication until the target count is reached or max retries are exhausted.
 *
 * @param operation - A function that takes the current items and returns a Promise of new items.
 * @param targetCount - The desired number of unique items to collect.
 * @param maxConsecutiveRetries - Maximum number of consecutive retries allowed when no new items are found. Defaults to 2.
 * @param dedupFn - A function to deduplicate items. Defaults to using a Set for uniqueness.
 * @returns A Promise that resolves to an array of unique items.
 *
 * @typeParam T - The type of items being collected.
 */
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

    if (!Array.isArray(newItems)) {
      logger.warn('Operation returned non-iterable result. Skipping this iteration.');
      consecutiveRetries++;
      continue;
    }

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
        .filter((line) => line.includes('Prompt:'))
        .map((line) => line.substring(line.indexOf('Prompt:') + 'Prompt:'.length).trim());
    };
    const allPrompts = sampleArray(await retryWithDeduplication(generatePrompts, n), n);
    logger.debug(`Generating test cases from ${allPrompts.length} prompts`);
    return allPrompts.sort().map((prompt) => ({
      vars: {
        [this.injectVar]: prompt,
      },
      assert: this.getAssertions(prompt),
    }));
  }
}
