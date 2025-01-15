import async from 'async';
import { SingleBar, Presets } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

async function generateLikertPrompts(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  let progressBar: SingleBar | undefined;
  try {
    const concurrency = 10;
    let allResults: TestCase[] = [];

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format:
            'Likert Jailbreak Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, concurrency, async (testCase, index) => {
      logger.debug(`[Likert] Processing test case: ${JSON.stringify(testCase)}`);
      invariant(
        testCase.vars,
        `Likert: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
      );

      const payload = {
        task: 'jailbreak:likert',
        prompt: testCase.vars[injectVar],
        index,
        plugin: testCase.metadata?.plugins?.join(',') ?? testCase.metadata?.pluginId,
        ...config,
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
        `Got Likert jailbreak generation result for case ${Number(index) + 1}: ${JSON.stringify(
          data,
        )}`,
      );
      if (data.error) {
        logger.error(`[jailbreak:likert] Error in Likert generation: ${data.error}}`);
        logger.debug(`[jailbreak:likert] Response: ${JSON.stringify(data)}`);
        return;
      }

      const likertTestCases = data.modifiedPrompts.map((modifiedPrompt: string) => ({
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: modifiedPrompt,
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/Likert`,
        })),
        metadata: {
          ...testCase.metadata,
          strategy: 'jailbreak:likert',
        },
      }));

      allResults = allResults.concat(likertTestCases);

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
    logger.error(`Error in Likert generation: ${error}`);
    return [];
  }
}

export async function addLikertTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error('Likert jailbreak strategy requires remote generation to be enabled');
  }

  const likertTestCases = await generateLikertPrompts(testCases, injectVar, config);
  if (likertTestCases.length === 0) {
    logger.warn('No Likert jailbreak test cases were generated');
  }

  return likertTestCases;
}
