import async from 'async';
import { SingleBar, Presets } from 'cli-progress';
import invariant from 'tiny-invariant';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import { getRemoteGenerationUrl } from '../constants';
import { neverGenerateRemote } from '../util';

async function generateCompositePrompts(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  try {
    const batchSize = 8;
    const concurrency = 10;
    const batches = [];
    for (let i = 0; i < testCases.length; i += batchSize) {
      batches.push(testCases.slice(i, i + batchSize));
    }

    let allResults: TestCase[] = [];
    let processedBatches = 0;

    let progressBar: SingleBar | undefined;
    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format:
            'Composite Jailbreak Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} batches',
          hideCursor: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(batches.length, 0);
    }

    await async.forEachOfLimit(batches, concurrency, async (batch, index) => {
      const payload = {
        task: 'jailbreak:composite',
        testCases: batch,
        injectVar,
        config: {
          ...config,
          ...(config.modelFamily && { modelFamily: config.modelFamily }),
          ...(config.n && { n: config.n }),
        },
      };

      const { data } = await fetchWithCache(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        REQUEST_TIMEOUT_MS,
      );

      logger.debug(
        `Got composite jailbreak generation result for batch ${Number(index) + 1}: ${JSON.stringify(
          data,
        )}`,
      );

      const compositeTestCases = batch.flatMap((testCase, i) => {
        invariant(
          testCase.vars,
          `Composite: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
        );

        return data.modifiedPrompts[i].map((modifiedPrompt: string) => ({
          ...testCase,
          prompt: modifiedPrompt,
          assert: testCase.assert?.map((assertion) => ({
            ...assertion,
            metric: `${assertion.metric}/Composite`,
          })),
          metadata: {
            ...testCase.metadata,
            strategy: 'jailbreak:composite',
          },
        }));
      });

      allResults = allResults.concat(compositeTestCases);

      processedBatches++;
      if (progressBar) {
        progressBar.increment(1);
      } else {
        logger.debug(`Processed batch ${processedBatches} of ${batches.length}`);
      }
    });

    if (progressBar) {
      progressBar.stop();
    }

    return allResults;
  } catch (error) {
    logger.error(`Error in composite generation: ${error}`);
    return [];
  }
}

export async function addCompositeTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error('Composite jailbreak strategy requires remote generation to be enabled');
  }

  const compositeTestCases = await generateCompositePrompts(testCases, injectVar, config);
  if (compositeTestCases.length === 0) {
    logger.warn('No composite  jailbreak test cases were generated');
  }

  return compositeTestCases;
}
