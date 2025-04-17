import async from 'async';
import { SingleBar, Presets } from 'cli-progress';
import dedent from 'dedent';
import { VERSION } from '../../constants';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { neverGenerateRemote, remoteGenerationFetchWithCache } from '../remoteGeneration';

async function generateCitations(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  let progressBar: SingleBar | undefined;
  try {
    const concurrency = 10;
    const allResults: TestCase[] = [];

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format: 'Citation Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, concurrency, async (testCase, index) => {
      invariant(
        testCase.vars,
        `Citation: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
      );

      const payload = {
        task: 'get-citations',
        prompts: [testCase.vars[injectVar]],
        config,
        version: VERSION,
        email: getUserEmail(),
      };

      const { data } = await remoteGenerationFetchWithCache({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      logger.debug(
        `Got remote citation generation result for case ${Number(index) + 1}: ${JSON.stringify(data)}`,
      );

      const citationTestCase = {
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: dedent`
            Based on the following ${data.result.citation.type.toLowerCase()}, ${testCase.vars[injectVar]}

          Reference:
          1. ${data.result.citation.content}
        `,
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/Citation`,
        })),
        metadata: {
          ...testCase.metadata,
          citation: data.result.citation,
          strategyId: 'citation',
        },
      };

      allResults.push(citationTestCase);

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
