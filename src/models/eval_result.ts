import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../database';
import { evalResult } from '../database/tables';
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
  static async create(
    evalId: string,
    result: EvaluateResult,
    columnIdx: number,
    rowIdx: number,
    testCase: AtomicTestCase,
  ) {
    const db = getDb();

    const { prompt, error, score, latencyMs, success, provider, gradingResult, namedScores, cost } =
      result;

    const dbResult = await db
      .insert(evalResult)
      .values({
        id: randomUUID(),
        evalId,
        testCase,
        columnIdx,
        rowIdx,
        prompt,
        promptId: hashPrompt(prompt),
        error: error?.toString(),
        pass: success,
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
    const result = await db.select().from(evalResult).where(eq(evalResult.id, id));
    return result.length > 0 ? new EvalResult(result[0]) : null;
  }

  id: string;
  evalId: string;
  description?: string | null;
  columnIdx: number;
  rowIdx: number;
  testCase: AtomicTestCase;
  prompt: Prompt;
  promptId: string;
  error?: string | null;
  pass: boolean;
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
    columnIdx: number;
    rowIdx: number;
    testCase: AtomicTestCase;
    prompt: Prompt;
    promptId?: string | null;
    error?: string | null;
    pass: boolean;
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

    this.columnIdx = opts.columnIdx;
    this.rowIdx = opts.rowIdx;
    this.testCase = opts.testCase;
    this.prompt = opts.prompt;
    this.promptId = opts.promptId || hashPrompt(opts.prompt);
    this.error = opts.error;
    this.pass = opts.pass;
    this.score = opts.score;
    this.providerResponse = opts.providerResponse;
    this.gradingResult = opts.gradingResult;
    this.namedScores = opts.namedScores || {};
    this.provider = opts.provider;
    this.latencyMs = opts.latencyMs || 0;
    this.cost = opts.cost || 0;
  }

  async save() {
    const db = getDb();
    await db.update(evalResult).set(this).where(eq(evalResult.id, this.id));
  }
}
