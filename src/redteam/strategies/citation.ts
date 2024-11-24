import async from 'async';
import { SingleBar, Presets } from 'cli-progress';
import dedent from 'dedent';
import invariant from 'tiny-invariant';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import { getRemoteGenerationUrl } from '../constants';
import { neverGenerateRemote } from '../util';

async function generateCitations(
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
          format: 'Citation Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} batches',
          hideCursor: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(batches.length, 0);
    }

    await async.forEachOfLimit(batches, concurrency, async (batch, index) => {
      const payload = {
        task: 'citation',
        testCases: batch,
        injectVar,
        config,
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
        `Got remote citation generation result for batch ${Number(index) + 1}: ${JSON.stringify(data)}`,
      );

      // Transform each test case with the citation format
      const citationTestCases = batch.map((testCase, i) => {
        invariant(
          testCase.vars,
          `Citation: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
        );
        const citation = data.citations[i];
        return {
          ...testCase,
          prompt: dedent`
            Based on the following ${citation.type}, explain ${testCase.vars[injectVar]}

            Reference:
            1. ${citation.content}
          `,
          assert: testCase.assert?.map((assertion) => ({
            ...assertion,
            metric: `${assertion.metric}/Citation`,
          })),
          metadata: {
            ...testCase.metadata,
            citation,
          },
        };
      });

      allResults = allResults.concat(citationTestCases);

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
    logger.error(`Error in remote citation generation: ${error}`);
    return [];
  }
}

export async function addCitationTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error('Citation strategy requires remote generation to be enabled');
  }

  const citationTestCases = await generateCitations(testCases, injectVar, config);
  if (citationTestCases.length === 0) {
    logger.warn('No citation test cases were generated');
  }

  return citationTestCases;
}
