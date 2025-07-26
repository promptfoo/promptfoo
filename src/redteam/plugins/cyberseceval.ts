import { fetchWithTimeout } from '../../fetch';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { Assertion, TestCase } from '../../types';
import type { PluginConfig } from '../types';
import { RedteamPluginBase } from './base';

const PLUGIN_ID = 'promptfoo:redteam:cyberseceval';

const DATASET_URL =
  'https://raw.githubusercontent.com/promptfoo/promptfoo/refs/heads/main/examples/cyberseceval/prompt_injection.json';

const DATASET_URL_MULTILINGUAL =
  'https://raw.githubusercontent.com/promptfoo/promptfoo/refs/heads/main/examples/cyberseceval/prompt_injection_multilingual.json';

interface CyberSecEvalInput {
  test_case_prompt: string;
  user_input: string;
  judge_question: string;
  injection_type: string;
  injection_variant: string;
  risk_category: string;
  speaking_language: string;
}

type CyberSecEvalVars = Record<string, string>;

interface CyberSecEvalTestCase extends TestCase {
  vars: CyberSecEvalVars;
}

interface CyberSecEvalPluginConfig extends PluginConfig {
  multilingual?: boolean;
  fullDataset?: boolean;
}

async function fetchDataset(
  limit: number | undefined,
  isMultilingual: boolean,
): Promise<CyberSecEvalTestCase[]> {
  try {
    const url = isMultilingual ? DATASET_URL_MULTILINGUAL : DATASET_URL;
    const response = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`[CyberSecEval] HTTP status: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as CyberSecEvalInput[];
    logger.debug(`[CyberSecEval] Got response from ${DATASET_URL}: ${JSON.stringify(data)}`);

    if (!data || !Array.isArray(data)) {
      throw new Error(`[CyberSecEval] Invalid response from ${DATASET_URL}`);
    }

    // Convert the raw data to test cases and shuffle them
    const testCases = data
      .map(
        (input): CyberSecEvalTestCase => ({
          vars: {
            test_case_prompt: input.test_case_prompt,
            user_input: input.user_input,
            judge_question: input.judge_question,
          },
        }),
      )
      .sort(() => Math.random() - 0.5); // Shuffle the array

    // Apply limit if specified
    const finalTestCases = limit !== undefined ? testCases.slice(0, limit) : testCases;

    logger.debug(`[CyberSecEval] Generated ${finalTestCases.length} test cases`);
    if (finalTestCases.length === 0) {
      throw new Error(`[CyberSecEval] No test cases generated`);
    }

    return finalTestCases;
  } catch (error) {
    logger.error(`[CyberSecEval] Error fetching dataset: ${error}`);
    return [];
  }
}

export class CyberSecEvalPlugin extends RedteamPluginBase {
  readonly id = PLUGIN_ID;
  static readonly canGenerateRemote = false;

  async getTemplate(): Promise<string> {
    throw new Error('Not implemented');
  }

  getAssertions(prompt: string): Assertion[] {
    return [
      {
        metric: 'CyberSecEval',
        type: 'llm-rubric',
        value: `${prompt}. If yes, fail. Otherwise, pass.`,
      },
    ];
  }

  async generateTests(n: number, _delayMs?: number): Promise<TestCase[]> {
    const cfg = this.config as CyberSecEvalPluginConfig;

    try {
      // For full dataset, fetch all available records
      const limit = cfg.fullDataset ? undefined : n;
      const testCases = await fetchDataset(limit, cfg.multilingual as boolean);

      if (!testCases || testCases.length === 0) {
        logger.warn(`No test cases fetched for CyberSecEval plugin`);
        return [];
      }

      const selected = cfg.fullDataset ? testCases : testCases.slice(0, n);

      if (selected.length < n && !cfg.fullDataset) {
        logger.warn(
          `CyberSecEval: Only ${selected.length} test cases available out of ${n} requested`,
        );
      }

      return selected.map((test) => ({
        vars: {
          [this.injectVar]: JSON.stringify([
            {
              role: 'system',
              content: test.vars.test_case_prompt,
            },
            {
              role: 'user',
              content: test.vars.user_input,
            },
          ]),
        },
        assert: [
          {
            metric: 'CyberSecEval',
            type: 'llm-rubric',
            value: `${test.vars.judge_question}. If yes, fail. Otherwise, pass.`,
          },
        ],
      }));
    } catch (error) {
      logger.error(`Failed to generate CyberSecEval tests: ${error}`);
      return [];
    }
  }
}
