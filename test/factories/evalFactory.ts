import { randomUUID } from 'crypto';

import { ResultFailureReason } from '../../src';
import { getDb } from '../../src/database';
import { evalsTable } from '../../src/database/tables';
import Eval from '../../src/models/eval';
import { oldStyleEval } from './data/eval/database_records';

import type { EvaluateResult } from '../../src/types';

interface CreateEvalOptions {
  numResults?: number;
  resultTypes?: Array<'success' | 'error' | 'failure'>;
  withHighlights?: boolean;
  withNamedScores?: boolean;
  searchableContent?: string;
}

export default class EvalFactory {
  static async create(options?: CreateEvalOptions) {
    const eval_ = await Eval.create(
      {
        providers: [{ id: 'test-provider' }],
        prompts: ['What is the capital of {{state}}?'],
        tests: [
          { vars: { state: 'colorado' }, assert: [{ type: 'contains', value: 'Denver' }] },
          { vars: { state: 'california' }, assert: [{ type: 'contains', value: 'Sacramento' }] },
        ],
      },
      [
        { raw: 'What is the capital of california?', label: 'What is the capital of {{state}}?' },
        { raw: 'What is the capital of colorado?', label: 'What is the capital of {{state}}?' },
      ],
      { id: randomUUID() },
    );
    await eval_.addPrompts([
      {
        raw: 'What is the capital of california?',
        label: 'What is the capital of {{state}}?',
        provider: 'test-provider',
        metrics: {
          score: 1,
          testPassCount: 1,
          testFailCount: 1,
          testErrorCount: 0,
          assertPassCount: 1,
          assertFailCount: 1,
          totalLatencyMs: 200,
          tokenUsage: { total: 20, prompt: 10, completion: 10, cached: 0 },
          namedScores: {},
          namedScoresCount: {},
          redteam: {
            pluginPassCount: {},
            pluginFailCount: {},
            strategyPassCount: {},
            strategyFailCount: {},
          },
          cost: 0.007,
        },
      },
    ]);

    // If no options are provided, create the default test results
    if (!options || options.numResults === undefined) {
      await this.addDefaultResults(eval_);
      return eval_;
    }

    // Generate the specified number of test results with the requested characteristics
    const numResults = options.numResults === 0 ? 0 : options.numResults || 2;
    const resultTypes = options.resultTypes || ['success'];
    const withHighlights = options.withHighlights || false;
    const withNamedScores = options.withNamedScores || false;
    const searchableContent = options.searchableContent || '';

    for (let i = 0; i < numResults; i++) {
      // Cycle through the result types
      const resultTypeIndex = i % resultTypes.length;
      const resultType = resultTypes[resultTypeIndex];

      // Create a test result based on the type
      await this.addCustomResult(eval_, {
        testIdx: i,
        resultType,
        withHighlight: withHighlights && i % 3 === 0, // Add highlights to every 3rd result if enabled
        withNamedScores,
        searchableContent,
      });
    }

    return eval_;
  }

  private static async addDefaultResults(eval_: Eval) {
    await eval_.addResult({
      description: 'test-description',
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { state: 'colorado' }, assert: [{ type: 'contains', value: 'Denver' }] },
      promptId: 'test-prompt',
      provider: { id: 'test-provider', label: 'test-label' },
      prompt: {
        raw: 'What is the capital of {{state}}?',
        label: 'What is the capital of {{state}}?',
      },
      vars: { state: 'colorado' },
      response: {
        output: 'denver',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      },
      error: null,
      failureReason: ResultFailureReason.NONE,
      success: true,
      score: 1,
      latencyMs: 100,
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Expected output "denver" to equal "Denver"',
        namedScores: {},
        tokensUsed: { total: 10, prompt: 5, completion: 5, cached: 0 },
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Expected output "denver" to equal "Denver"',
            assertion: {
              type: 'equals',
              value: 'denver',
            },
          },
        ],
        assertion: null,
      },
      namedScores: {},
      cost: 0.007,
      metadata: {},
    });

    await eval_.addResult({
      description: 'test-description',
      promptIdx: 0,
      testIdx: 1,
      testCase: {
        vars: { state: 'california' },
        assert: [{ type: 'contains', value: 'Sacramento' }],
      },
      promptId: 'test-prompt',
      provider: { id: 'test-provider', label: 'test-label' },
      prompt: {
        raw: 'What is the capital of {{state}}?',
        label: 'What is the capital of {{state}}?',
      },
      vars: { state: 'california' },
      response: {
        output: 'san francisco',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      },
      error: null,
      failureReason: ResultFailureReason.NONE,
      success: false,
      score: 0,
      latencyMs: 100,
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'Expected output "san francisco" to equal "Sacramento"',
        namedScores: {},
        tokensUsed: { total: 10, prompt: 5, completion: 5, cached: 0 },
        componentResults: [
          {
            pass: false,
            score: 0,
            reason: 'Expected output "san francisco" to equal "Sacramento"',
            assertion: {
              type: 'equals',
              value: 'denver',
            },
          },
        ],
        assertion: null,
      },
      namedScores: {},
      cost: 0.007,
      metadata: {},
    });
  }

  private static async addCustomResult(
    eval_: Eval,
    options: {
      testIdx: number;
      resultType: 'success' | 'error' | 'failure';
      withHighlight?: boolean;
      withNamedScores?: boolean;
      searchableContent?: string;
    },
  ) {
    const { testIdx, resultType, withHighlight, withNamedScores, searchableContent } = options;
    const stateName = `state${testIdx}`;
    const output =
      resultType === 'success'
        ? `Capital of ${stateName} is TestCity${testIdx}`
        : `Incorrect answer for ${stateName}${searchableContent ? ` ${searchableContent}` : ''}`;

    const result: Partial<EvaluateResult> = {
      description: `test-${resultType}-${testIdx}`,
      promptIdx: 0,
      testIdx,
      testCase: {
        vars: { state: stateName },
        assert: [{ type: 'contains', value: `TestCity${testIdx}` }],
      },
      promptId: 'test-prompt',
      provider: { id: 'test-provider', label: 'test-label' },
      prompt: {
        raw: `What is the capital of ${stateName}?`,
        label: 'What is the capital of {{state}}?',
      },
      vars: { state: stateName },
      response: {
        output,
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      },
      success: resultType === 'success',
      score: resultType === 'success' ? 1 : 0,
      latencyMs: 100,
      namedScores: withNamedScores
        ? { accuracy: resultType === 'success' ? 1 : 0.2, relevance: 0.8 }
        : {},
      cost: 0.007,
      metadata: {},
    };

    // Handle error type
    if (resultType === 'error') {
      result.error = `Error processing ${stateName}: Test error message`;
      result.failureReason = ResultFailureReason.ERROR;
    } else {
      result.error = null;
      result.failureReason =
        resultType === 'success' ? ResultFailureReason.NONE : ResultFailureReason.ASSERT;
    }

    // Configure the grading result
    if (resultType !== 'error') {
      let comment = '';
      if (withHighlight) {
        comment = `!highlight Important observation for ${stateName}`;
      }

      result.gradingResult = {
        pass: resultType === 'success',
        score: resultType === 'success' ? 1 : 0,
        reason:
          resultType === 'success'
            ? `Output matches expected value for ${stateName}`
            : `Output doesn't match expected value for ${stateName}`,
        comment,
        namedScores: withNamedScores
          ? { accuracy: resultType === 'success' ? 1 : 0.2, relevance: 0.8 }
          : {},
        tokensUsed: { total: 10, prompt: 5, completion: 5, cached: 0 },
        componentResults: [
          {
            pass: resultType === 'success',
            score: resultType === 'success' ? 1 : 0,
            reason:
              resultType === 'success'
                ? `Expected output matches for ${stateName}`
                : `Expected output doesn't match for ${stateName}`,
            assertion: {
              type: 'equals',
              value: `TestCity${testIdx}`,
            },
          },
        ],
        assertion: null,
      };
    }

    await eval_.addResult(result as EvaluateResult);
  }

  static async createOldResult() {
    const db = getDb();
    return (await db.insert(evalsTable).values(oldStyleEval()).returning())[0];
  }
}
