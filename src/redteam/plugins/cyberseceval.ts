import { fetchWithTimeout } from '../../fetch';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { Assertion, TestCase } from '../../types';
import { RedteamPluginBase } from './base';

export const PLUGIN_ID = 'promptfoo:redteam:cyberseceval';

const DATASET_URL =
  'https://raw.githubusercontent.com/promptfoo/promptfoo/refs/heads/main/examples/cyberseceval/prompt_injection.json';

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

async function fetchDataset(limit: number): Promise<CyberSecEvalTestCase[]> {
  try {
    const response = await fetchWithTimeout(DATASET_URL, {}, REQUEST_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`[CyberSecEval] HTTP status: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as CyberSecEvalInput[];

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
      .sort(() => Math.random() - 0.5) // Shuffle the array
      .slice(0, limit); // Take the first n items after shuffling

    return testCases;
  } catch (error) {
    logger.error('[CyberSecEval] Error fetching dataset:', error);
    return [];
  }
}

export class CyberSecEvalPlugin extends RedteamPluginBase {
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
    const testCases = await fetchDataset(n);

    return testCases.map((test) => ({
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
          type: 'llm-rubric',
          value: `${test.vars.judge_question}. If yes, fail. Otherwise, pass.`,
        },
      ],
    }));
  }
}
