import async from 'async';
import { Presets, SingleBar } from 'cli-progress';
import { isLoggedIntoCloud } from '../../globalConfig/accounts';
import logger from '../../logger';
import invariant from '../../util/invariant';
import {
  getRemoteGenerationExplicitlyDisabledError,
  neverGenerateRemote,
} from '../remoteGeneration';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';
import { postRemoteGenerationTask } from '../remoteGenerationTask';

import type { TestCase } from '../../types/index';
import type { StrategyRuntimeContext } from './types';

export const CONCURRENCY = 10;

async function generateGcgPrompts(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> & { n?: number },
  runtimeContext?: StrategyRuntimeContext,
): Promise<TestCase[]> {
  let progressBar: SingleBar | undefined;
  try {
    const allResults: TestCase[] = [];

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format: 'GCG Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
          gracefulExit: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, CONCURRENCY, async (testCase, index) => {
      const caseNumber = Number(index) + 1;
      logger.debug('[GCG] Processing test case', {
        caseNumber,
        totalCases: testCases.length,
        hasInjectVar: testCase.vars ? injectVar in testCase.vars : false,
        varsKeyCount: Object.keys(testCase.vars ?? {}).length,
        assertionCount: testCase.assert?.length ?? 0,
        metadataKeyCount: Object.keys(testCase.metadata ?? {}).length,
      });
      invariant(testCase.vars, `GCG: testCase.vars is required for case ${caseNumber}`);

      const payload = {
        task: 'gcg',
        query: testCase.vars[injectVar],
        ...(config.n && { n: config.n }),
        ...remoteGenerationContextPayload(config.targetId),
      };

      interface GCGGenerationResponse {
        error?: string;
        responses?: string[];
      }

      const { data, status, statusText } = await postRemoteGenerationTask<GCGGenerationResponse>(
        payload,
        runtimeContext,
        {
          headers: { 'x-promptfoo-silent': 'true' },
          bustCache: true,
        },
      );

      logger.debug('[GCG] Got generation result', {
        caseNumber,
        hasError: Boolean(data.error),
        responseCount: Array.isArray(data.responses) ? data.responses.length : 0,
      });

      if (data.error) {
        logger.error('[GCG] Error in GCG generation', {
          caseNumber,
          status,
          statusText,
        });
        logger.debug('[GCG] Error response metadata', {
          caseNumber,
          hasError: true,
        });
        return;
      }

      // Handle both single response and array of responses
      const responses = data.responses as string[];
      const originalText = String(testCase.vars[injectVar]);

      const gcgTestCases = responses.map((response: string) => ({
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: response,
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: assertion.metric ? `${assertion.metric}/GCG` : assertion.metric,
        })),
        metadata: {
          ...testCase.metadata,
          strategyId: 'gcg',
          originalText,
        },
      }));

      allResults.push(...gcgTestCases);

      if (progressBar) {
        progressBar.increment(1);
      } else {
        logger.debug('[GCG] Processed test case', {
          caseNumber,
          totalCases: testCases.length,
        });
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
    logger.error('Error in GCG generation', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return [];
  }
}

export async function addGcgTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
  runtimeContext?: StrategyRuntimeContext,
): Promise<TestCase[]> {
  if (!isLoggedIntoCloud()) {
    throw new Error(
      'The GCG strategy requires authentication. Run `promptfoo auth login` to use this strategy.',
    );
  }

  if (neverGenerateRemote()) {
    throw new Error(getRemoteGenerationExplicitlyDisabledError('GCG strategy'));
  }

  const gcgTestCases = await generateGcgPrompts(testCases, injectVar, config, runtimeContext);
  if (gcgTestCases.length === 0) {
    logger.warn('No GCG test cases were generated');
  }

  return gcgTestCases;
}
