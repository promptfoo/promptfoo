import { randomUUID } from 'crypto';
import { getDb } from '../../src/database';
import { evals as evalsTable } from '../../src/database/tables';
import Eval from '../../src/models/eval';

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
    await eval_.addResult(
      {
        description: 'test-description',
        promptIdx: 0,
        testCaseIdx: 0,
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
      },
      0,
      0,
      { vars: { state: 'colorado' }, assert: [{ type: 'contains', value: 'Denver' }] },
    );
    await eval_.addResult(
      {
        description: 'test-description',
        promptIdx: 0,
        testCaseIdx: 0,
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
        success: true,
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
      },
      0,
      0,
      { vars: { state: 'california' }, assert: [{ type: 'contains', value: 'Sacramento' }] },
    );

    return eval_;
  }

  static async createOldResult() {
    const db = getDb();
    await db.insert(evalsTable).values({
      id: randomUUID(),
      createdAt: Date.now(),
      config: {},
      results: {
        version: 2,
        timestamp: '2024-09-30T20:02:51.036Z',
        results: [],
        stats: {
          successes: 18,
          failures: 18,
          tokenUsage: {
            total: 1200,
            prompt: 0,
            completion: 0,
            cached: 1200,
          },
        },
        table: {
          head: {
            prompts: [],
            vars: [],
          },
          body: [],
        },
      },
      prompts: [],
    });
  }
}
