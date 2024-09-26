import { randomUUID } from 'crypto';
import { getDb } from '../database';
import { evalResult } from '../database/tables';
import { hashPrompt } from '../prompts/utils';
import type { GradingResult, Prompt, ProviderOptions, ProviderResponse } from '../types';
import { type EvaluateResult } from '../types';
import { sha256 } from '../util';

export default class EvalResult {
  static async create(
    evalId: string,
    result: EvaluateResult,
    columnIdx: number,
    rowIdx: number,
    description?: string,
  ) {
    const db = getDb();

    const {
      vars,
      prompt,
      error,
      score,
      latencyMs,
      success,
      provider,
      gradingResult,
      namedScores,
      cost,
    } = result;

    const dbResult = await db
      .insert(evalResult)
      .values({
        // @ts-expect-error
        id: randomUUID(),
        evalId,
        description,
        columnIdx,
        rowIdx,
        vars,
        varsHash: sha256(JSON.stringify(vars)),
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

  id: string;
  evalId: string;
  description?: string | null;
  columnIdx: number;
  rowIdx: number;
  vars: Record<string, string> | null;
  varsHash: string;
  prompt: Prompt;
  promptId: string;
  error?: string | null;
  pass: boolean;
  score: number;
  providerResponse: ProviderResponse;
  gradingResult: GradingResult;
  namedScores: Record<string, number>;
  provider: ProviderOptions;
  latencyMs: number;
  cost: number;

  constructor(opts: {
    id: string;
    evalId: string;
    description?: string | null;
    columnIdx: number;
    rowIdx: number;
    vars: Record<string, string> | null;
    varsHash: string | null;
    prompt: Prompt;
    promptId?: string | null;
    error?: string | null;
    pass: boolean;
    score: number;
    providerResponse: ProviderResponse;
    gradingResult: GradingResult;
    namedScores?: Record<string, number> | null;
    provider: ProviderOptions;
    latencyMs?: number | null;
    cost?: number | null;
  }) {
    this.id = opts.id;
    this.evalId = opts.evalId;
    this.description = opts.description;
    this.columnIdx = opts.columnIdx;
    this.rowIdx = opts.rowIdx;
    this.vars = opts.vars;
    this.varsHash = opts.varsHash || sha256(JSON.stringify(opts.vars));
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
}
