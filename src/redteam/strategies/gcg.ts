import async from 'async';
import { SingleBar, Presets } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

export const CONCURRENCY = 10;

async function generateGcgPrompts(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> & { n?: number },
): Promise<TestCase[]> {
  let progressBar: SingleBar | undefined;
  try {
    const allResults: TestCase[] = [];

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format: 'GCG Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, CONCURRENCY, async (testCase, index) => {
      logger.debug(`[GCG] Processing test case: ${JSON.stringify(testCase)}`);
      invariant(
        testCase.vars,
        `GCG: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
      );

      const payload = {
        task: 'gcg',
        query: testCase.vars[injectVar],
        ...(config.n && { n: config.n }),
        email: getUserEmail(),
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
        `Got GCG generation result for case ${Number(index) + 1}: ${JSON.stringify(data)}`,
      );

      if (data.error) {
        logger.error(`[GCG] Error in GCG generation: ${data.error}`);
        logger.debug(`[GCG] Response: ${JSON.stringify(data)}`);
        return;
      }

      // Handle both single response and array of responses
      const responses = data.responses as string[];

      const gcgTestCases = responses.map((response: string) => ({
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: response,
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/GCG`,
        })),
        metadata: {
          ...testCase.metadata,
          strategy: 'gcg',
        },
      }));

      allResults.push(...gcgTestCases);

      if (progressBar) {
        progressBar.increment(1);
      } else {
        logger.debug(`Processed case ${Number(index) + 1} of ${testCases.length}`);
      }
    });

    if (progressBar) {
      progressBar.stop();
    }

    return allResults;
  } catch (error) {
    if (progressBar) {
      progressBar.stop();
    }
    logger.error(`Error in GCG generation: ${error}`);
    return [];
  }
}

export async function addGcgTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error('GCG strategy requires remote generation to be enabled');
  }

  const gcgTestCases = await generateGcgPrompts(testCases, injectVar, config);
  if (gcgTestCases.length === 0) {
    logger.warn('No GCG test cases were generated');
  }

  return gcgTestCases;
}
