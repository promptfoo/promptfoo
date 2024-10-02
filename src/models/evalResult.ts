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
    promptIdx: number,
    testCaseIdx: number,
    testCase: AtomicTestCase,
  ) {
    const db = getDb();

    const { prompt, error, score, latencyMs, success, provider, gradingResult, namedScores, cost } =
      result;

    const dbResult = await db
      .insert(evalResultsTable)
      .values({
        id: randomUUID(),
        evalId,
        testCase,
        promptIdx,
        testCaseIdx,
        prompt,
        promptId: hashPrompt(prompt),
        error: error?.toString(),
        success,
        score,
        providerResponse: result.response,
        gradingResult,
        namedScores,
        provider,
        latencyMs,
        cost,
      })
      .returning();
    return new EvalResult(dbResult[0]);
  }

  static async findById(id: string) {
    const db = getDb();
    const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
    return result.length > 0 ? new EvalResult(result[0]) : null;
  }

  static async findManyByEvalId(evalId: string) {
    const db = getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, evalId));
    return results.map((result) => new EvalResult(result));
  }

  id: string;
  evalId: string;
  description?: string | null;
  promptIdx: number;
  testCaseIdx: number;
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

  constructor(opts: {
    id: string;
    evalId: string;
    promptIdx: number;
    testCaseIdx: number;
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
  }) {
    this.id = opts.id;
    this.evalId = opts.evalId;

    this.promptIdx = opts.promptIdx;
    this.testCaseIdx = opts.testCaseIdx;
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
  }

  async save() {
    const db = getDb();
    //check if this exists in the db
    const existing = await db
      .select({ id: evalResultsTable.id })
      .from(evalResultsTable)
      .where(eq(evalResultsTable.id, this.id));
    if (existing.length > 0) {
      await db.update(evalResultsTable).set(this).where(eq(evalResultsTable.id, this.id));
    } else {
      const result = await db.insert(evalResultsTable).values(this).returning();
      this.id = result[0].id;
    }
  }

  toEvaluateResult(): EvaluateResult {
    return {
      id: this.id,
      promptIdx: this.promptIdx,
      testCaseIdx: this.testCaseIdx,
      testCase: this.testCase,
      prompt: this.prompt,
      promptId: this.promptId,
      error: this.error || undefined,
      score: this.score,
      response: this.providerResponse || undefined,
      success: this.success,
      vars: this.testCase.vars || {},
      description: this.description || undefined,
      provider: this.provider,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      cost: this.cost,
      gradingResult: this.gradingResult,
    };
  }
}
