import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { extractAndStoreBinaryData, isBlobStorageEnabled } from '../blobs/extractor';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import {
  getStripFlags,
  persistTraceMetadata,
  projectPrompt,
  projectProviderResponse,
  projectTestCase,
  redactSensitiveResultFieldsForDb,
  sanitizeForDb,
  sanitizeForDbWithSecrets,
  sanitizeProvider,
  surfaceTraceMetadata,
} from '../evaluator/resultProcessing';
import { hashPrompt } from '../prompts/utils';
import {
  type AtomicTestCase,
  type EvaluateResult,
  type GradingResult,
  isResultFailureReason,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
} from '../types/index';
import { getCurrentTimestamp } from '../util/time';
import {
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import { invalidateEvaluationCache } from './evalMutation';
import { clearCountCache } from './evalPerformance';

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
      traceId,
      evaluationId,
    } = result;

    // Persist trace linkage inside a private metadata namespace so it survives
    // EvalResult round-trips without a Drizzle schema migration.
    const persistedMetadata = persistTraceMetadata(metadata, traceId, evaluationId);

    // Normalize provider for storage and extract blobs from responses.
    const preSanitizeTestCase = {
      ...testCase,
      ...(testCase.provider && {
        provider: sanitizeProvider(testCase.provider),
      }),
    };

    const processedResponse = await extractAndStoreBinaryData(result.response, {
      evalId,
      testIdx: result.testIdx,
      promptIdx: result.promptIdx,
    });

    // Sanitize all JSON fields to remove circular references and non-serializable values.
    // `testCase` and `prompt` can contain a resolved runtime provider under
    // `options.provider` or `config.provider` (used for llm-rubric judging); that
    // provider may hold a live SDK client with credentials (Anthropic apiKey, etc.)
    // and circular references — see `sanitizeForDbWithSecrets`. Other fields go
    // through the lighter `sanitizeForDb` which only strips circular refs /
    // non-serializable values.
    const args = {
      id: crypto.randomUUID(),
      evalId,
      testCase: sanitizeForDbWithSecrets(preSanitizeTestCase),
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt: sanitizeForDbWithSecrets(prompt),
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: sanitizeForDb(processedResponse || null),
      gradingResult: sanitizeForDb(gradingResult || null),
      namedScores: sanitizeForDb(namedScores),
      provider: sanitizeProvider(provider),
      latencyMs,
      cost,
      metadata: sanitizeForDb(persistedMetadata),
      failureReason,
    };
    if (persist) {
      const db = await getDb();

      const redacted = redactSensitiveResultFieldsForDb({
        response: args.response,
        gradingResult: args.gradingResult,
        metadata: args.metadata,
      });
      args.response = redacted.response;
      args.gradingResult = redacted.gradingResult;
      args.metadata = redacted.metadata;
      const dbResult = await db.insert(evalResultsTable).values(args).returning();
      clearCountCache(evalId);
      return new EvalResult({ ...dbResult[0], persisted: true });
    }
    return new EvalResult(args);
  }

  static async createManyFromEvaluateResult(results: EvaluateResult[], evalId: string) {
    const db = await getDb();
    const returnResults: EvalResult[] = [];
    const processedResults: EvaluateResult[] = [];
    for (const result of results) {
      const processedResponse = isBlobStorageEnabled()
        ? await extractAndStoreBinaryData(result.response, {
            evalId,
            testIdx: result.testIdx,
            promptIdx: result.promptIdx,
          })
        : result.response;
      processedResults.push({ ...result, response: processedResponse ?? undefined });
    }

    await db.transaction(async (tx) => {
      for (const result of processedResults) {
        // See `createFromEvaluateResult` for why `testCase` and `prompt` go
        // through the credential-redacting sanitizer while the other fields
        // stay on the lighter `sanitizeForDb`. Trace IDs travel inside metadata
        // via `persistTraceMetadata`; strip the top-level fields so the DB write
        // only carries known-schema columns.
        const { traceId: _traceId, evaluationId: _evaluationId, ...rest } = result;
        const sanitizedResult = {
          ...rest,
          testCase: sanitizeForDbWithSecrets(result.testCase),
          prompt: sanitizeForDbWithSecrets(result.prompt),
          ...redactSensitiveResultFieldsForDb({
            response: sanitizeForDb(result.response),
            gradingResult: sanitizeForDb(result.gradingResult),
            metadata: sanitizeForDb(
              persistTraceMetadata(result.metadata, result.traceId, result.evaluationId),
            ),
          }),
          namedScores: sanitizeForDb(result.namedScores),
          provider: result.provider ? sanitizeProvider(result.provider) : result.provider,
        };
        const dbResult = await tx
          .insert(evalResultsTable)
          .values({ ...sanitizedResult, evalId, id: crypto.randomUUID() })
          .returning()
          .get();
        returnResults.push(new EvalResult({ ...dbResult, persisted: true }));
      }
    });
    clearCountCache(evalId);
    return returnResults;
  }

  static async findById(id: string) {
    const db = await getDb();
    const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
    return result.length > 0 ? new EvalResult({ ...result[0], persisted: true }) : null;
  }

  static async findManyByEvalId(evalId: string, opts?: { testIdx?: number }) {
    const db = await getDb();
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

  static async findManyByEvalIdAndTestIndices(evalId: string, testIndices: number[]) {
    if (!testIndices.length) {
      return [];
    }

    const db = await getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          testIndices.length === 1
            ? eq(evalResultsTable.testIdx, testIndices[0])
            : inArray(evalResultsTable.testIdx, testIndices),
        ),
      );

    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  /**
   * Returns a set of completed (testIdx,promptIdx) pairs for a given eval.
   * Key format: `${testIdx}:${promptIdx}`
   *
   * @param evalId - The evaluation ID to query
   * @param opts.excludeErrors - If true, excludes results with ERROR failureReason (used in retry mode)
   */
  static async getCompletedIndexPairs(
    evalId: string,
    opts?: { excludeErrors?: boolean },
  ): Promise<Set<string>> {
    const db = await getDb();
    const whereClause = opts?.excludeErrors
      ? and(
          eq(evalResultsTable.evalId, evalId),
          // Exclude ERROR results so they can be retried
          // This prevents resume mode from skipping ERROR results during retry
          ne(evalResultsTable.failureReason, ResultFailureReason.ERROR),
        )
      : eq(evalResultsTable.evalId, evalId);

    const rows = await db
      .select({ testIdx: evalResultsTable.testIdx, promptIdx: evalResultsTable.promptIdx })
      .from(evalResultsTable)
      .where(whereClause);
    const ret = new Set<string>();
    for (const r of rows) {
      ret.add(`${r.testIdx}:${r.promptIdx}`);
    }
    return ret;
  }

  // This is a generator that yields batches of results from the database
  // These are batched by test Id, not just results to ensure we get all results for a given test
  static async *findManyByEvalIdBatched(
    evalId: string,
    opts?: {
      batchSize?: number;
    },
  ): AsyncGenerator<EvalResult[]> {
    const db = await getDb();
    const batchSize = opts?.batchSize || 100;
    let offset = 0;

    while (true) {
      const nextResult = await db
        .select({ testIdx: evalResultsTable.testIdx })
        .from(evalResultsTable)
        .where(and(eq(evalResultsTable.evalId, evalId), gte(evalResultsTable.testIdx, offset)))
        .orderBy(evalResultsTable.testIdx)
        .limit(1)
        .get();

      if (!nextResult) {
        break;
      }

      offset = nextResult.testIdx;
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
  // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
  metadata: Record<string, any>;
  traceId?: string;
  evaluationId?: string;
  failureReason: ResultFailureReason;
  persisted: boolean;
  pluginId?: string;

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
    // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
    metadata?: Record<string, any> | null;
    failureReason: ResultFailureReason | number;
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
    ({
      metadata: this.metadata,
      traceId: this.traceId,
      evaluationId: this.evaluationId,
    } = surfaceTraceMetadata(opts.metadata));
    this.failureReason = isResultFailureReason(opts.failureReason)
      ? opts.failureReason
      : ResultFailureReason.NONE;
    this.persisted = opts.persisted || false;
    this.pluginId = opts.testCase.metadata?.pluginId;
  }

  async save() {
    const db = await getDb();
    // Trace linkage and `pluginId` aren't schema columns — `pluginId` is re-derived from
    // testCase metadata in the constructor, and trace linkage travels inside the metadata
    // JSON via persistTraceMetadata. Drizzle would drop them silently, but excluding them
    // explicitly keeps the write payload aligned with the schema.
    const { traceId: _traceId, evaluationId: _evaluationId, pluginId: _pluginId, ...rest } = this;
    const persistedValues = {
      ...rest,
      metadata: persistTraceMetadata(this.metadata, this.traceId, this.evaluationId),
    };
    //check if this exists in the db
    if (this.persisted) {
      await db
        .update(evalResultsTable)
        .set({ ...persistedValues, updatedAt: getCurrentTimestamp() })
        .where(eq(evalResultsTable.id, this.id))
        .run();
    } else {
      const result = await db.insert(evalResultsTable).values(persistedValues).returning();
      this.id = result[0].id;
      this.persisted = true;
    }
    invalidateEvaluationCache(this.evalId);
  }

  toEvaluateResult(): EvaluateResult {
    const {
      shouldStripPromptText,
      shouldStripResponseOutput,
      shouldStripTestVars,
      shouldStripGradingResult,
      shouldStripMetadata,
    } = getStripFlags();

    const response = projectProviderResponse(this.response, {
      stripMetadata: shouldStripMetadata,
      stripOutput: shouldStripResponseOutput,
    });

    const prompt = projectPrompt(this.prompt, shouldStripPromptText);

    const testCase = projectTestCase(this.testCase, {
      stripMetadata: shouldStripMetadata,
      stripVars: shouldStripTestVars,
    });
    // Mirror the live accounting in the evaluator: a response counts as one provider
    // request even when it reports no token usage, and a grading result counts as one
    // assertion request (with its tokens folded in when present).
    const tokenUsage = createEmptyTokenUsage();
    if (this.response) {
      accumulateResponseTokenUsage(tokenUsage, this.response);
    }
    if (this.gradingResult) {
      accumulateGradingTokenUsage(tokenUsage, this.gradingResult.tokensUsed, {
        cached: this.gradingResult.metadata?.cachedResponse,
      });
    }

    return {
      cost: this.cost,
      ...(this.response?.incurredCost !== undefined && {
        incurredCost: this.response.incurredCost,
      }),
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult ? null : this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      ...(this.traceId ? { traceId: this.traceId } : {}),
      ...(this.evaluationId ? { evaluationId: this.evaluationId } : {}),
      provider: { id: this.provider.id, label: this.provider.label },
      response,
      score: this.score,
      success: this.success,
      testCase,
      testIdx: this.testIdx,
      tokenUsage,
      vars: shouldStripTestVars ? {} : this.testCase.vars || {},
      metadata: shouldStripMetadata ? {} : this.metadata,
      failureReason: this.failureReason,
    };
  }
}

/** Normalize an `EvalResult` model instance or a plain `EvaluateResult` to `EvaluateResult`. */
export function asEvaluateResult(result: EvalResult | EvaluateResult): EvaluateResult {
  return 'toEvaluateResult' in result ? result.toEvaluateResult() : result;
}

export { getResultIndexKey } from '../evaluator/resultIndex';
// Compatibility exports for existing source consumers. New callers use evaluator/resultProcessing.
export {
  PROMPTFOO_METADATA_KEY,
  persistTraceMetadata,
  sanitizeProvider,
  sanitizeResultForJsonlArtifact,
  stripTraceLinkageFromMetadata,
} from '../evaluator/resultProcessing';
