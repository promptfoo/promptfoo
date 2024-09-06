import { SingleBar, Presets } from 'cli-progress';
import dedent from 'dedent';
import invariant from 'tiny-invariant';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import { REMOTE_GENERATION_URL } from '../constants';
import { loadRedteamProvider } from '../providers/shared';
import { shouldGenerateRemote } from '../util';

const DEFAULT_LANGUAGES = ['bn', 'sw', 'jv']; // Bengali, Swahili, Javanese

export async function translate(text: string, lang: string): Promise<string> {
  const redteamProvider = await loadRedteamProvider({ jsonOnly: true });

  const result = await redteamProvider.callApi(
    dedent`Translate the <Text> below to language '${lang}'. Respond with JSON object containing {translation: string}.
    
    <Text>
    ${text}
    </Text>`,
  );
  return (JSON.parse(result.output) as { translation: string }).translation;
}

export async function generateMultilingual(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  try {
    const payload = {
      task: 'multilingual',
      testCases,
      injectVar,
      config,
    };

    const { data } = await fetchWithCache(
      REMOTE_GENERATION_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      REQUEST_TIMEOUT_MS,
    );

    logger.debug(`Got remote multilingual generation result: ${JSON.stringify(data)}`);
    return data.result as TestCase[];
  } catch (error) {
    logger.error(`Error in remote multilingual generation: ${error}`);
    throw new Error(`Could not perform remote multilingual generation: ${error}`);
  }
}

export async function addMultilingual(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  if (shouldGenerateRemote()) {
    return generateMultilingual(testCases, injectVar, config);
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

  for (const testCase of testCases) {
    const originalText = String(testCase.vars![injectVar]);

    for (const lang of languages) {
      const translatedText = await translate(originalText, lang);

      translatedTestCases.push({
        ...testCase,
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/Multilingual-${lang.toUpperCase()}`,
        })),
        vars: {
          ...testCase.vars,
          [injectVar]: translatedText,
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
