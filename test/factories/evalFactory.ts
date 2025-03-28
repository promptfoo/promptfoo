import { randomUUID } from 'crypto';
import { ResultFailureReason } from '../../src';
import { getDb } from '../../src/database';
import { evalsTable } from '../../src/database/tables';
import Eval from '../../src/models/eval';
import { oldStyleEval } from './data/eval/database_records';

export default class EvalFactory {
  static async create() {
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

    return eval_;
  }

  static async createOldResult() {
    const db = getDb();
    return (await db.insert(evalsTable).values(oldStyleEval()).returning())[0];
  }
}
