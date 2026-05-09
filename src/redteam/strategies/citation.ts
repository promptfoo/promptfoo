import async from 'async';
import { Presets, SingleBar } from 'cli-progress';
import dedent from 'dedent';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../../providers/shared';
import invariant from '../../util/invariant';
import {
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../remoteGeneration';
import { mergeProviderTokenUsage } from './util';

import type { TestCase } from '../../types/index';
import type { TokenUsage } from '../../types/shared';

class CitationGenerationError extends Error {
  constructor(
    message: string,
    public readonly tokenUsage?: TokenUsage,
  ) {
    super(message);
    this.name = 'CitationGenerationError';
  }
}

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
          gracefulExit: true,
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
        task: 'citation',
        testCases: [testCase],
        injectVar,
        topic: testCase.vars[injectVar],
        config,
        email: getUserEmail(),
      };

      interface CitationGenerationResponse {
        error?: string;
        result?: {
          citation: {
            type: string;
            content: string;
          };
        };
        tokenUsage?: TokenUsage;
      }

      const { data } = await fetchWithCache<CitationGenerationResponse>(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        getRequestTimeoutMs(),
      );

      logger.debug(
        `Got remote citation generation result for case ${Number(index) + 1}: ${JSON.stringify(data)}`,
      );

      // Check for API error response (matching GCG pattern)
      if (data.error) {
        logger.error(`[Citation] Error in citation generation: ${data.error}`);
        logger.debug(`[Citation] Response: ${JSON.stringify(data)}`);
        if (testCases.length === 1 && data.tokenUsage) {
          throw new CitationGenerationError(data.error, data.tokenUsage);
        }
        if (progressBar) {
          progressBar.increment(1);
        }
        return;
      }

      // Validate response structure before accessing
      if (!data.result?.citation) {
        logger.error(`[Citation] Invalid response structure - missing citation data`);
        logger.debug(`[Citation] Response: ${JSON.stringify(data)}`);
        if (testCases.length === 1 && data.tokenUsage) {
          throw new CitationGenerationError(
            'Citation generation returned invalid response structure',
            data.tokenUsage,
          );
        }
        if (progressBar) {
          progressBar.increment(1);
        }
        return;
      }

      const originalText = String(testCase.vars[injectVar]);

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
          originalText,
          ...(data.tokenUsage
            ? {
                providerTokenUsage: mergeProviderTokenUsage(
                  testCase.metadata?.providerTokenUsage,
                  data.tokenUsage,
                ),
              }
            : {}),
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
    if (error instanceof CitationGenerationError) {
      throw error;
    }
    return [];
  }
}

export async function addCitationTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error(getRemoteGenerationExplicitlyDisabledError('Citation strategy'));
  }

  const citationTestCases = await generateCitations(testCases, injectVar, config);
  if (citationTestCases.length === 0) {
    logger.warn('No citation test cases were generated');
  }

  return citationTestCases;
}
