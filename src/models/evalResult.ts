import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../database';
import { evalResultsTable } from '../database/tables';
import { hashPrompt } from '../prompts/utils';
import type {
  AtomicTestCase,
  GradingResult,
  Prompt,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { type EvaluateResult } from '../types';

export default class EvalResult {
  static async createFromEvaluateResult(
    evalId: string,
    result: EvaluateResult,
    testCase: AtomicTestCase,
    opts?: { persist: boolean },
  ) {
    const persist = opts?.persist == null ? true : opts.persist;
    const { prompt, error, score, latencyMs, success, provider, gradingResult, namedScores, cost } =
      result;
    const args = {
      id: randomUUID(),
      evalId,
      testCase,
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt,
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      providerResponse: result.response || null,
      gradingResult: gradingResult || null,
      namedScores,
      provider,
      latencyMs,
      cost,
    };
    if (persist) {
      const db = getDb();

      const dbResult = await db.insert(evalResultsTable).values(args).returning();
      return new EvalResult({ ...dbResult[0], persisted: true });
    }
    return new EvalResult(args);
  }

  static async findById(id: string) {
    const db = getDb();
    const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
    return result.length > 0 ? new EvalResult({ ...result[0], persisted: true }) : null;
  }

  static async findManyByEvalId(evalId: string) {
    const db = getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, evalId));
    return results.map((result) => new EvalResult({ ...result, persisted: true }));
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
  providerResponse: ProviderResponse | null;
  gradingResult: GradingResult | null;
  namedScores: Record<string, number>;
  provider: ProviderOptions;
  latencyMs: number;
  cost: number;
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
    providerResponse: ProviderResponse | null;
    gradingResult: GradingResult | null;
    namedScores?: Record<string, number> | null;
    provider: ProviderOptions;
    latencyMs?: number | null;
    cost?: number | null;
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
    this.providerResponse = opts.providerResponse;
    this.gradingResult = opts.gradingResult;
    this.namedScores = opts.namedScores || {};
    this.provider = opts.provider;
    this.latencyMs = opts.latencyMs || 0;
    this.cost = opts.cost || 0;
    this.persisted = opts.persisted || false;
  }

  async save() {
    const db = getDb();
    //check if this exists in the db
    if (this.persisted) {
      await db.update(evalResultsTable).set(this).where(eq(evalResultsTable.id, this.id));
    } else {
      const result = await db.insert(evalResultsTable).values(this).returning();
      this.id = result[0].id;
      this.persisted = true;
    }
  }

  toEvaluateResult(): EvaluateResult {
    return {
      cost: this.cost,
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt: this.prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      provider: this.provider,
      response: this.providerResponse || undefined,
      score: this.score,
      success: this.success,
      testCase: this.testCase,
      testIdx: this.testIdx,
      vars: this.testCase.vars || {},
    };
  }
}
