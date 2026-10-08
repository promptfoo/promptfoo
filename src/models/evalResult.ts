import { isDeepStrictEqual } from 'node:util';

import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { extractBlobHashesFromValue } from '../blobs/blobRefs';
import { extractAndStoreBinaryData, isBlobStorageEnabled } from '../blobs/extractor';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { type EnvVarKey, getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import { PromptfooAttributes } from '../tracing/genaiTracer';
import {
  type ApiProvider,
  type AtomicTestCase,
  type EnvOverrides,
  type EvaluateResult,
  type GradingResult,
  isResultFailureReason,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
  type TraceData,
} from '../types/index';
import { serializeEvalValue } from '../util/evalSerialization';
import { getCurrentTimestamp } from '../util/time';
import {
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import { invalidateEvaluationCache } from './evalMutation';
import { clearCountCache } from './evalPerformance';

function stripMediaReferences(value: unknown): unknown {
  if (
    extractBlobHashesFromValue(value).length > 0 ||
    (typeof value === 'string' && /^data:[^,]*,/i.test(value))
  ) {
    return '[output stripped]';
  }
  if (Array.isArray(value)) {
    return value.map(stripMediaReferences);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stripMediaReferences(item)]),
    );
  }
  return value;
}

function projectOutputMetadata<T>(
  metadata: T,
  stripOutput: boolean,
  responseMetadata: ProviderResponse['metadata'],
  testMetadata?: AtomicTestCase['metadata'],
): T {
  if (!stripOutput || !metadata || !responseMetadata || typeof metadata !== 'object') {
    return metadata;
  }
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (
        !Object.prototype.hasOwnProperty.call(responseMetadata, key) ||
        (testMetadata && isDeepStrictEqual(value, testMetadata[key]))
      ) {
        return [[key, value]];
      }
      return key === 'audio' || key === 'blobUris'
        ? []
        : [[key, stripMediaReferences(serializeEvalValue(value))]];
    }),
  ) as T;
}

function projectProviderResponse(
  response: ProviderResponse | undefined,
  options: { stripMetadata: boolean; stripOutput: boolean },
): ProviderResponse | undefined {
  if (!response) {
    return response;
  }

  if (!options.stripMetadata && !options.stripOutput) {
    return response;
  }

  const projectedResponse: ProviderResponse = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(response)
    : { ...response };

  if (options.stripOutput) {
    projectedResponse.output = '[output stripped]';
    delete projectedResponse.raw;
    delete projectedResponse.providerTransformedOutput;
    delete projectedResponse.audio;
    delete projectedResponse.video;
    delete projectedResponse.images;
    if (projectedResponse.metadata) {
      projectedResponse.metadata = projectOutputMetadata(
        projectedResponse.metadata,
        true,
        projectedResponse.metadata,
      );
    }
  }

  return projectedResponse;
}

export function projectPrompt<T extends Prompt>(prompt: T, stripPromptText: boolean): T {
  return stripPromptText
    ? {
        ...prompt,
        raw: '[prompt stripped]',
        template: undefined,
      }
    : prompt;
}

export function projectTracesForOutput(
  traces: TraceData[],
  {
    shouldStripMetadata,
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
  }: ReturnType<typeof getStripFlags>,
) {
  if (
    !shouldStripMetadata &&
    !shouldStripPromptText &&
    !shouldStripResponseOutput &&
    !shouldStripTestVars
  ) {
    return traces;
  }

  return traces.map((trace) => {
    let projectedTrace = trace;
    if (shouldStripMetadata) {
      const { metadata: _metadata, ...traceWithoutMetadata } = trace;
      projectedTrace = traceWithoutMetadata;
    } else if (shouldStripTestVars && trace.metadata && 'vars' in trace.metadata) {
      const { metadata: traceMetadata, ...traceWithoutMetadata } = trace;
      const { vars: _vars, ...metadata } = traceMetadata;
      projectedTrace = {
        ...traceWithoutMetadata,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };
    }

    if (!shouldStripPromptText && !shouldStripResponseOutput) {
      return projectedTrace;
    }

    return {
      ...projectedTrace,
      spans: projectedTrace.spans.map((span) => {
        if (!span.attributes) {
          return span;
        }

        const projectedAttributes = { ...span.attributes };
        if (shouldStripPromptText) {
          delete projectedAttributes[PromptfooAttributes.REQUEST_BODY];
        }
        if (shouldStripResponseOutput) {
          delete projectedAttributes[PromptfooAttributes.RESPONSE_BODY];
        }

        const { attributes: _attributes, ...projectedSpan } = span;
        return {
          ...projectedSpan,
          ...(Object.keys(projectedAttributes).length > 0 && {
            attributes: projectedAttributes,
          }),
        };
      }),
    };
  });
}

function projectTestCase(
  testCase: AtomicTestCase,
  options: { stripMetadata: boolean; stripVars: boolean; stripOutput: boolean },
): AtomicTestCase {
  if (!options.stripMetadata && !options.stripVars && !options.stripOutput) {
    return testCase;
  }

  const projectedTestCase: AtomicTestCase = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(testCase)
    : { ...testCase };

  if (options.stripVars) {
    projectedTestCase.vars = undefined;
  }
  if (options.stripOutput) {
    delete projectedTestCase.providerOutput;
  }
  if (options.stripMetadata && testCase.metadata?.__promptfoo?.remote === true) {
    projectedTestCase.metadata = { __promptfoo: { remote: true } };
  }

  return projectedTestCase;
}

// `__promptfoo` is reserved at the metadata top level for promptfoo-internal namespaced data
// (currently `traceLinkage`). User-supplied non-object values under this key are overwritten —
// log so the rare collision is visible. Mirrored in `EvalQueries.getMetadataKeysFromEval` /
// `getMetadataValuesFromEval`, which hide the namespace from the metadata-discovery API.
export const PROMPTFOO_METADATA_KEY = '__promptfoo';
const TRACE_LINKAGE_KEY = 'traceLinkage';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function persistTraceMetadata(
  metadata: EvaluateResult['metadata'],
  traceId: EvaluateResult['traceId'],
  evaluationId: EvaluateResult['evaluationId'],
): EvaluateResult['metadata'] {
  if (!traceId && !evaluationId) {
    return stripTraceLinkageFromMetadata(metadata);
  }

  const metadataRecord = metadata ?? {};
  const promptfooMetadata = asRecord(metadataRecord[PROMPTFOO_METADATA_KEY]);
  if (metadataRecord[PROMPTFOO_METADATA_KEY] !== undefined && promptfooMetadata === undefined) {
    logger.warn(
      `[EvalResult] Overwriting non-object metadata.${PROMPTFOO_METADATA_KEY} with internal trace linkage; the key is reserved for promptfoo internals.`,
    );
  }
  if (promptfooMetadata && TRACE_LINKAGE_KEY in promptfooMetadata) {
    logger.warn(
      `[EvalResult] Overwriting metadata.${PROMPTFOO_METADATA_KEY}.${TRACE_LINKAGE_KEY} with internal trace linkage; the path is reserved for promptfoo internals.`,
    );
  }

  // `traceId`/`evaluationId` are only persisted when truthy — JSON.stringify strips
  // undefined values, and `surfaceTraceMetadata` requires `typeof === 'string'` on read.
  return {
    ...metadataRecord,
    [PROMPTFOO_METADATA_KEY]: {
      ...(promptfooMetadata ?? {}),
      [TRACE_LINKAGE_KEY]: { traceId, evaluationId },
    },
  };
}

export function stripTraceLinkageFromMetadata<T extends Record<string, unknown> | null | undefined>(
  metadata: T,
): T {
  const metadataRecord = asRecord(metadata);
  const promptfooMetadata = asRecord(metadataRecord?.[PROMPTFOO_METADATA_KEY]);
  if (!metadataRecord || !promptfooMetadata || !(TRACE_LINKAGE_KEY in promptfooMetadata)) {
    return metadata;
  }

  const { [TRACE_LINKAGE_KEY]: _traceLinkage, ...remainingPromptfooMetadata } = promptfooMetadata;
  const strippedMetadata = { ...metadataRecord };
  delete strippedMetadata[PROMPTFOO_METADATA_KEY];
  if (Object.keys(remainingPromptfooMetadata).length > 0) {
    strippedMetadata[PROMPTFOO_METADATA_KEY] = remainingPromptfooMetadata;
  }

  return strippedMetadata as T;
}

function surfaceTraceMetadata(metadata: Record<string, unknown> | null | undefined): {
  traceId?: string;
  evaluationId?: string;
  metadata: Record<string, unknown>;
} {
  const metadataRecord = metadata ?? {};
  const promptfooMetadata = asRecord(metadataRecord[PROMPTFOO_METADATA_KEY]);
  const traceLinkage = asRecord(promptfooMetadata?.[TRACE_LINKAGE_KEY]);

  const traceId = typeof traceLinkage?.traceId === 'string' ? traceLinkage.traceId : undefined;
  const evaluationId =
    typeof traceLinkage?.evaluationId === 'string' ? traceLinkage.evaluationId : undefined;

  // Strip the reserved namespace whenever a `traceLinkage` entry exists — even if the
  // stored ids are malformed (non-string), the internal namespace must never surface to
  // users. Gate on presence of the key, not on whether the ids read back as valid strings.
  const hasTraceLinkage = promptfooMetadata != null && TRACE_LINKAGE_KEY in promptfooMetadata;
  if (!hasTraceLinkage) {
    return { traceId, evaluationId, metadata: metadataRecord };
  }

  return {
    traceId,
    evaluationId,
    metadata: stripTraceLinkageFromMetadata(metadataRecord),
  };
}

// Shared by configuration and result-row output projections.
export function getStripFlags(env?: EnvOverrides) {
  const getFlag = (key: EnvVarKey) => {
    const value = env?.[key];
    return value === undefined ? getEnvBool(key, false) : parseEnvBool(String(value), false);
  };
  return {
    shouldStripPromptText: getFlag('PROMPTFOO_STRIP_PROMPT_TEXT'),
    shouldStripResponseOutput: getFlag('PROMPTFOO_STRIP_RESPONSE_OUTPUT'),
    shouldStripTestVars: getFlag('PROMPTFOO_STRIP_TEST_VARS'),
    shouldStripGradingResult: getFlag('PROMPTFOO_STRIP_GRADING_RESULT'),
    shouldStripMetadata: getFlag('PROMPTFOO_STRIP_METADATA'),
  };
}

/** Serialize a local JSONL row, applying only explicit PROMPTFOO_STRIP_* options. */
export function serializeResultForJsonlArtifact<T extends object>(
  result: T,
  stripFlags = getStripFlags(),
): T {
  const {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
    shouldStripGradingResult,
    shouldStripMetadata,
  } = stripFlags;

  const artifactResult = result as T & Record<string, unknown>;
  const serialized = {
    response: serializeEvalValue(artifactResult.response as ProviderResponse | null | undefined),
    gradingResult: serializeEvalValue(artifactResult.gradingResult),
    metadata: serializeEvalValue(artifactResult.metadata),
  };
  const response = projectProviderResponse(serialized.response ?? undefined, {
    stripMetadata: shouldStripMetadata,
    stripOutput: shouldStripResponseOutput,
  });

  return {
    ...result,
    ...(artifactResult.testCase
      ? {
          testCase: projectTestCase(serializeEvalValue(artifactResult.testCase as AtomicTestCase), {
            stripMetadata: shouldStripMetadata,
            stripVars: shouldStripTestVars,
            stripOutput: shouldStripResponseOutput,
          }),
        }
      : {}),
    ...(artifactResult.vars === undefined
      ? {}
      : {
          vars: shouldStripTestVars ? {} : serializeEvalValue(artifactResult.vars),
        }),
    ...(artifactResult.prompt
      ? {
          prompt: projectPrompt(
            serializeEvalValue(artifactResult.prompt as Prompt),
            shouldStripPromptText,
          ),
        }
      : {}),
    ...(artifactResult.provider
      ? {
          provider: serializeEvalValue(
            artifactResult.provider as ApiProvider | ProviderOptions | string,
          ),
        }
      : {}),
    response,
    gradingResult: shouldStripGradingResult ? null : serialized.gradingResult,
    namedScores: serializeEvalValue(artifactResult.namedScores),
    metadata: shouldStripMetadata
      ? {}
      : projectOutputMetadata(
          serialized.metadata,
          shouldStripResponseOutput,
          serialized.response?.metadata,
          (artifactResult.testCase as AtomicTestCase | undefined)?.metadata,
        ),
  } as T;
}

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

    const processedResponse = await extractAndStoreBinaryData(result.response, {
      evalId,
      testIdx: result.testIdx,
      promptIdx: result.promptIdx,
    });

    // Preserve payloads and fixture values; serialize runtime providers as config snapshots.
    const args = {
      id: crypto.randomUUID(),
      evalId,
      testCase: serializeEvalValue(testCase),
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt: serializeEvalValue(prompt),
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: serializeEvalValue(processedResponse || null),
      gradingResult: serializeEvalValue(gradingResult || null),
      namedScores: serializeEvalValue(namedScores),
      provider: serializeEvalValue(provider),
      latencyMs,
      cost,
      metadata: serializeEvalValue(persistedMetadata),
      failureReason,
    };
    if (persist) {
      const db = await getDb();

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
        // through the same serializer as individual rows.
        const { traceId: _traceId, evaluationId: _evaluationId, ...rest } = result;
        const serializedResult = {
          ...rest,
          testCase: serializeEvalValue(result.testCase),
          prompt: serializeEvalValue(result.prompt),
          response: serializeEvalValue(result.response),
          gradingResult: serializeEvalValue(result.gradingResult),
          metadata: serializeEvalValue(
            persistTraceMetadata(result.metadata, result.traceId, result.evaluationId),
          ),
          namedScores: serializeEvalValue(result.namedScores),
          provider: result.provider ? serializeEvalValue(result.provider) : result.provider,
        };
        const dbResult = await tx
          .insert(evalResultsTable)
          .values({ ...serializedResult, evalId, id: crypto.randomUUID() })
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
    const persistedValues = serializeEvalValue({
      ...rest,
      error: this.error ?? null,
      metadata: persistTraceMetadata(this.metadata, this.traceId, this.evaluationId),
    });
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

  toEvaluateResult(stripFlags = getStripFlags()): EvaluateResult {
    const {
      shouldStripPromptText,
      shouldStripResponseOutput,
      shouldStripTestVars,
      shouldStripGradingResult,
      shouldStripMetadata,
    } = stripFlags;

    const response = projectProviderResponse(this.response, {
      stripMetadata: shouldStripMetadata,
      stripOutput: shouldStripResponseOutput,
    });

    const prompt = projectPrompt(this.prompt, shouldStripPromptText);

    const testCase = projectTestCase(this.testCase, {
      stripMetadata: shouldStripMetadata,
      stripVars: shouldStripTestVars,
      stripOutput: shouldStripResponseOutput,
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
      metadata: shouldStripMetadata
        ? {}
        : projectOutputMetadata(
            this.metadata,
            shouldStripResponseOutput,
            this.response?.metadata,
            this.testCase.metadata,
          ),
      failureReason: this.failureReason,
    };
  }
}

/** Normalize an `EvalResult` model instance or a plain `EvaluateResult` to `EvaluateResult`. */
export function asEvaluateResult(
  result: EvalResult | EvaluateResult,
  stripFlags = getStripFlags(),
): EvaluateResult {
  return 'toEvaluateResult' in result ? result.toEvaluateResult(stripFlags) : result;
}

/** Canonical `testIdx:promptIdx` key used to dedupe/look up a result across the streaming,
 * recovery, and comparison paths. */
export function getResultIndexKey(result: Pick<EvaluateResult, 'testIdx' | 'promptIdx'>): string {
  return `${result.testIdx}:${result.promptIdx}`;
}
