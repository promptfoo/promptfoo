import async from 'async';
import { SingleBar, Presets } from 'cli-progress';
import dedent from 'dedent';
import yaml from 'js-yaml';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { redteamProviderManager } from '../providers/shared';
import { getRemoteGenerationUrl, shouldGenerateRemote } from '../remoteGeneration';

export const DEFAULT_LANGUAGES = ['bn', 'sw', 'jv']; // Bengali, Swahili, Javanese

export async function generateMultilingual(
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
            'Remote Multilingual Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} batches',
          hideCursor: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(batches.length, 0);
    }

    await async.forEachOfLimit(batches, concurrency, async (batch, index) => {
      const payload = {
        task: 'multilingual',
        testCases: batch,
        injectVar,
        config,
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
        `Got remote multilingual generation result for batch ${Number(index) + 1}: ${JSON.stringify(data)}`,
      );
      allResults = allResults.concat(data.result as TestCase[]);

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
    logger.error(`Error in remote multilingual generation: ${error}`);
    return [];
  }
}

export async function translate(text: string, lang: string): Promise<string | null> {
  const redteamProvider = await redteamProviderManager.getProvider({
    jsonOnly: true,
    preferSmallModel: true,
  });
  const result = await redteamProvider.callApi(
    dedent`Translate the <Text> below to language '${lang}'. Respond with JSON object containing {translation: string}, , do not put it in markdown

    <Text>
    ${text}
    </Text>`,
  );
  try {
    return (yaml.load(result.output) as { translation: string }).translation;
  } catch (error) {
    logger.error(
      `[translate] Error parsing translation result: ${error} Provider Output: ${JSON.stringify(result.output, null, 2)}`,
    );
    return null;
  }
}

export async function addMultilingual(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  if (shouldGenerateRemote()) {
    const multilingualTestCases = await generateMultilingual(testCases, injectVar, config);
    if (multilingualTestCases.length > 0) {
      return multilingualTestCases;
    }
  }

  const languages = config.languages || DEFAULT_LANGUAGES;
  invariant(
    Array.isArray(languages),
    'multilingual strategy: `languages` must be an array of strings',
  );

  const translatedTestCases: TestCase[] = [];
  const totalOperations = testCases.length * languages.length;

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    progressBar = new SingleBar(
      {
        format: 'Generating Multilingual {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
        hideCursor: true,
      },
      Presets.shades_classic,
    );
    progressBar.start(totalOperations, 0);
  }

  let testCaseCount = 0;
  for (const testCase of testCases) {
    invariant(
      testCase.vars,
      `Multilingual: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );
    const originalText = String(testCase.vars[injectVar]);

    for (const lang of languages) {
      testCaseCount++;
      const translatedText = await translate(originalText, lang);
      if (!translatedText) {
        logger.debug(
          `[translate] Failed to translate to ${lang}, skipping ${testCase} #${testCaseCount}`,
        );
        continue;
      }

      translatedTestCases.push({
        ...testCase,
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: assertion.type?.startsWith('promptfoo:redteam:')
            ? `${assertion.type?.split(':').pop() || assertion.metric}/Multilingual-${lang.toUpperCase()}`
            : assertion.metric,
        })),
        vars: {
          ...testCase.vars,
          [injectVar]: translatedText,
        },
        metadata: {
          ...testCase.metadata,
          ...(testCase.metadata?.harmCategory && { harmCategory: testCase.metadata.harmCategory }),
        },
      });

      if (progressBar) {
        progressBar.increment(1);
      } else {
        logger.debug(`Translated to ${lang}: ${translatedTestCases.length} of ${totalOperations}`);
      }
    }
  }

  if (progressBar) {
    progressBar.stop();
  }

  return translatedTestCases;
}
