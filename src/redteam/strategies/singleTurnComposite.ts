import async from 'async';
import { SingleBar, Presets } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

async function generateCompositePrompts(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> & { n?: number; modelFamily?: string },
): Promise<TestCase[]> {
  let progressBar: SingleBar | undefined;
  try {
    const concurrency = 10;
    let allResults: TestCase[] = [];

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format:
            'Composite Jailbreak Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, concurrency, async (testCase, index) => {
      logger.debug(`[Composite] Processing test case: ${JSON.stringify(testCase)}`);
      invariant(
        testCase.vars,
        `Composite: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
      );

      const payload = {
        task: 'jailbreak:composite',
        prompt: testCase.vars[injectVar],
        email: getUserEmail(),
        ...(config.n && { n: config.n }),
        ...(config.modelFamily && { modelFamily: config.modelFamily }),
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
        `Got composite jailbreak generation result for case ${Number(index) + 1}: ${JSON.stringify(
          data,
        )}`,
      );
      if (data.error) {
        logger.error(`[jailbreak:composite] Error in composite generation: ${data.error}}`);
        logger.debug(`[jailbreak:composite] Response: ${JSON.stringify(data)}`);
        return;
      }

      const compositeTestCases = data.modifiedPrompts.map((modifiedPrompt: string) => ({
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: modifiedPrompt,
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/Composite`,
        })),
        metadata: {
          ...testCase.metadata,
          strategy: 'jailbreak:composite',
        },
      }));

      allResults = allResults.concat(compositeTestCases);

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
