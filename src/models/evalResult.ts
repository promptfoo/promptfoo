import { randomUUID } from 'crypto';
import { and, eq, gte, lt } from 'drizzle-orm';
import { getDb } from '../database';
import { evalResultsTable } from '../database/tables';
import { getEnvBool } from '../envars';
import { hashPrompt } from '../prompts/utils';
import type {
  ApiProvider,
  AtomicTestCase,
  GradingResult,
  Prompt,
  ProviderOptions,
  ProviderResponse,
  ResultFailureReason,
} from '../types';
import { type EvaluateResult } from '../types';
import { safeJsonStringify } from '../util/json';
import { getCurrentTimestamp } from '../util/time';

export default class EvalResult {
  static async createFromEvaluateResult(
    evalId: string,
    result: EvaluateResult,
    opts?: { persist: boolean },
  ) {
    const persist = opts?.persist == null ? true : opts.persist;
    const {
      prompt,
      error,
      score,
      latencyMs,
      success,
      provider,
      gradingResult,
      namedScores,
      cost,
      metadata,
      failureReason,
      testCase,
    } = result;
    const args = {
      id: randomUUID(),
      evalId,
      // Maybe stringify provider to avoid circular references
      testCase: {
        ...testCase,
        ...(testCase.provider && {
          provider: (() => {
            try {
              if (typeof testCase.provider === 'object' && (testCase.provider as ApiProvider)?.id) {
                return (testCase.provider as ApiProvider).id();
              }
            } catch {}
            return JSON.parse(safeJsonStringify(testCase.provider) as string);
          })(),
        }),
      },
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt,
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: result.response || null,
      gradingResult: gradingResult || null,
      namedScores,
      provider,
      latencyMs,
      cost,
      metadata,
      failureReason,
    };
    if (persist) {
      const db = getDb();

      const dbResult = await db.insert(evalResultsTable).values(args).returning();
      return new EvalResult({ ...dbResult[0], persisted: true });
    }
    return new EvalResult(args);
  }

  static async createManyFromEvaluateResult(results: EvaluateResult[], evalId: string) {
    const db = getDb();
    const returnResults: EvalResult[] = [];
    await db.transaction(async (tx) => {
      for (const result of results) {
        const dbResult = await tx
          .insert(evalResultsTable)
          .values({ ...result, evalId, id: randomUUID() })
          .returning();
        returnResults.push(new EvalResult({ ...dbResult[0], persisted: true }));
      }
    });
    return returnResults;
  }

  static async findById(id: string) {
    const db = getDb();
    const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
    return result.length > 0 ? new EvalResult({ ...result[0], persisted: true }) : null;
  }

  static async findManyByEvalId(evalId: string, opts?: { testIdx?: number }) {
    const db = getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          opts?.testIdx == null ? undefined : eq(evalResultsTable.testIdx, opts.testIdx),
        ),
      );
    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  // This is a generator that yields batches of results from the database
  // These are batched by test Id, not just results to ensure we get all results for a given test
  static async *findManyByEvalIdBatched(
    evalId: string,
    opts?: {
      batchSize?: number;
    },
  ): AsyncGenerator<EvalResult[]> {
    const db = getDb();
    const batchSize = opts?.batchSize || 100;
    let offset = 0;

    while (true) {
      const results = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            gte(evalResultsTable.testIdx, offset),
            lt(evalResultsTable.testIdx, offset + batchSize),
          ),
        )
        .all();

      if (results.length === 0) {
        break;
      }

      yield results.map((result) => new EvalResult({ ...result, persisted: true }));
      offset += batchSize;
    }
  }

  id: string;
  evalId: string;
  description?: string | null;
  promptIdx: number;
  testIdx: number;
  testCase: AtomicTestCase;
  prompt: Prompt;
  promptId: string;
  error?: string | null;
  success: boolean;
  score: number;
  response: ProviderResponse | undefined;
  gradingResult: GradingResult | null;
  namedScores: Record<string, number>;
  provider: ProviderOptions;
  latencyMs: number;
  cost: number;
  metadata: Record<string, any>;
  failureReason: ResultFailureReason;
  persisted: boolean;

  constructor(opts: {
    id: string;
    evalId: string;
    promptIdx: number;
    testIdx: number;
    testCase: AtomicTestCase;
    prompt: Prompt;
    promptId?: string | null;
    error?: string | null;
    success: boolean;
    score: number;
    response: ProviderResponse | null;
    gradingResult: GradingResult | null;
    namedScores?: Record<string, number> | null;
    provider: ProviderOptions;
    latencyMs?: number | null;
    cost?: number | null;
    metadata?: Record<string, any> | null;
    failureReason: ResultFailureReason;
    persisted?: boolean;
  }) {
    this.id = opts.id;
    this.evalId = opts.evalId;

    this.promptIdx = opts.promptIdx;
    this.testIdx = opts.testIdx;
    this.testCase = opts.testCase;
    this.prompt = opts.prompt;
    this.promptId = opts.promptId || hashPrompt(opts.prompt);
    this.error = opts.error;
    this.score = opts.score;
    this.success = opts.success;
    this.response = opts.response || undefined;
    this.gradingResult = opts.gradingResult;
    this.namedScores = opts.namedScores || {};
    this.provider = opts.provider;
    this.latencyMs = opts.latencyMs || 0;
    this.cost = opts.cost || 0;
    this.metadata = opts.metadata || {};
    this.failureReason = opts.failureReason;
    this.persisted = opts.persisted || false;
  }

  async save() {
    const db = getDb();
    //check if this exists in the db
    if (this.persisted) {
      await db
        .update(evalResultsTable)
        .set({ ...this, updatedAt: getCurrentTimestamp() })
        .where(eq(evalResultsTable.id, this.id));
    } else {
      const result = await db.insert(evalResultsTable).values(this).returning();
      this.id = result[0].id;
      this.persisted = true;
    }
  }

  toEvaluateResult(): EvaluateResult {
    const shouldStripPromptText = getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false);
    const shouldStripResponseOutput = getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false);
    const shouldStripTestVars = getEnvBool('PROMPTFOO_STRIP_TEST_VARS', false);
    const shouldStripGradingResult = getEnvBool('PROMPTFOO_STRIP_GRADING_RESULT', false);
    const shouldStripMetadata = getEnvBool('PROMPTFOO_STRIP_METADATA', false);

    const response =
      shouldStripResponseOutput && this.response
        ? {
            ...this.response,
            output: '[output stripped]',
          }
        : this.response;

    const prompt = shouldStripPromptText
      ? {
          ...this.prompt,
          raw: '[prompt stripped]',
        }
      : this.prompt;

    const testCase = shouldStripTestVars
      ? {
          ...this.testCase,
          vars: undefined,
        }
      : this.testCase;

    return {
      cost: this.cost,
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult ? null : this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      provider: { id: this.provider.id, label: this.provider.label },
      response,
      score: this.score,
      success: this.success,
      testCase,
      testIdx: this.testIdx,
      vars: shouldStripTestVars ? {} : this.testCase.vars || {},
      metadata: shouldStripMetadata ? {} : this.metadata,
      failureReason: this.failureReason,
    };
  }
}
