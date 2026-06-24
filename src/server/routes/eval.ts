import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { HUMAN_ASSERTION_TYPE } from '../../constants';
import { getDb } from '../../database';
import { evalResultsTable, evalsTable } from '../../database/tables';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import Eval, { EvalQueries } from '../../models/eval';
import { notifyEvaluationChanged } from '../../models/evalMutation';
import EvalResult, { PROMPTFOO_METADATA_KEY } from '../../models/evalResult';
import { evaluateWithSource } from '../../node';
import { EvalSchemas } from '../../types/api/eval';
import {
  type EvalTableDTO,
  type EvaluateSummaryV2,
  type EvaluateTable,
  type EvaluateTestSuite,
  type GradingResult,
  isResultFailureReason,
  type PromptMetrics,
  ResultFailureReason,
  type ResultsFile,
  type Vars,
} from '../../types/index';
import { sha256 } from '../../util/createHash';
import { deleteEval, deleteEvals, updateResult, writeResultsToDatabase } from '../../util/database';
import {
  ComparisonEvalNotFoundError,
  evalTableToJson,
  generateEvalCsv,
  getEvalTableOutputPromptLocationsBySize,
  getEvalTablePromptStrippedPayload,
  mergeComparisonTables,
} from '../../util/eval/evalTableUtils';
import invariant from '../../util/invariant';
import {
  redactAzureBlobSasTokens,
  restoreAzureBlobSasTokens,
  sanitizeObject,
} from '../../util/sanitizer';
import { shouldShareResults } from '../../util/sharing';
import { getCurrentTimestamp } from '../../util/time';
import { evalJobService } from '../services/evalJobService';
import { setDownloadHeaders } from '../utils/downloadHelpers';
import { replyValidationError, sendError } from '../utils/errors';
import type { Request, Response } from 'express';

export const evalRouter = Router();

type ResultMetricCategory = 'pass' | 'fail' | 'error';
const MANUAL_RATING_METADATA_KEY = 'manualRating';
const MANUAL_RATING_REASON = 'Manual result (overrides all other grading results)';

const ManualRatingStateSchema = z.object({
  version: z.literal(1),
  status: z.enum(['active', 'cleared']),
  original: z.object({
    success: z.boolean(),
    score: z.number(),
    failureReason: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    gradingResult: z
      .object({
        pass: z.boolean(),
        score: z.number(),
        reason: z.string(),
        comment: z.string().optional(),
        assertion: z.unknown().optional(),
        hadComment: z.boolean(),
        hadAssertion: z.boolean(),
        hadComponentResults: z.boolean(),
      })
      .nullable(),
  }),
  clearRequestHash: z.string().optional(),
});

type ManualRatingState = z.infer<typeof ManualRatingStateSchema>;
type PersistedEvalResult = typeof evalResultsTable.$inferSelect;

function normalizeFailureReason(value: number): ResultFailureReason {
  return isResultFailureReason(value) ? value : ResultFailureReason.NONE;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isHumanAssertion(assertion: unknown): boolean {
  return asRecord(assertion)?.type === HUMAN_ASSERTION_TYPE;
}

function isHumanGradingResult(value: unknown): value is GradingResult {
  return Boolean(asRecord(value) && isHumanAssertion(asRecord(value)?.assertion));
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(',')}]`;
  }
  const record = asRecord(value);
  if (record) {
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function getManualRatingState(metadata: unknown): ManualRatingState | undefined {
  const promptfooMetadata = asRecord(asRecord(metadata)?.[PROMPTFOO_METADATA_KEY]);
  const parsed = ManualRatingStateSchema.safeParse(promptfooMetadata?.[MANUAL_RATING_METADATA_KEY]);
  return parsed.success ? parsed.data : undefined;
}

function setManualRatingState(
  metadata: unknown,
  state: ManualRatingState | undefined,
): Record<string, unknown> | null {
  const metadataRecord = { ...(asRecord(metadata) ?? {}) };
  const promptfooMetadata = {
    ...(asRecord(metadataRecord[PROMPTFOO_METADATA_KEY]) ?? {}),
  };

  if (state) {
    promptfooMetadata[MANUAL_RATING_METADATA_KEY] = state;
  } else {
    delete promptfooMetadata[MANUAL_RATING_METADATA_KEY];
  }

  if (Object.keys(promptfooMetadata).length > 0) {
    metadataRecord[PROMPTFOO_METADATA_KEY] = promptfooMetadata;
  } else {
    delete metadataRecord[PROMPTFOO_METADATA_KEY];
  }
  return Object.keys(metadataRecord).length > 0 ? metadataRecord : null;
}

function captureManualRatingState(result: PersistedEvalResult): ManualRatingState {
  const gradingResult = result.gradingResult;
  return {
    version: 1,
    status: 'active',
    original: {
      success: result.success,
      score: result.score,
      failureReason: normalizeFailureReason(result.failureReason),
      gradingResult: gradingResult
        ? {
            pass: gradingResult.pass,
            score: gradingResult.score,
            reason: gradingResult.reason,
            comment: gradingResult.comment,
            assertion: gradingResult.assertion,
            hadComment: Object.hasOwn(gradingResult, 'comment'),
            hadAssertion: Object.hasOwn(gradingResult, 'assertion'),
            hadComponentResults: Object.hasOwn(gradingResult, 'componentResults'),
          }
        : null,
    },
  };
}

function restoreOriginalGradingResult(
  gradingResult: GradingResult,
  state: ManualRatingState,
): GradingResult {
  const original = state.original.gradingResult;
  const restored = { ...gradingResult } as GradingResult;
  const restoredRecord = restored as unknown as Record<string, unknown>;
  if (Array.isArray(restored.componentResults)) {
    restored.componentResults = restored.componentResults.filter(
      (componentResult) => !isHumanGradingResult(componentResult),
    );
  }

  if (original) {
    restored.pass = original.pass;
    restored.score = original.score;
    restored.reason = original.reason;
    if (original.hadComment) {
      restored.comment = original.comment;
    } else {
      delete restored.comment;
    }
    if (original.hadAssertion) {
      restoredRecord.assertion = original.assertion;
    } else {
      delete restored.assertion;
    }
    if (!original.hadComponentResults) {
      delete restored.componentResults;
    }
  } else {
    restored.pass = state.original.success;
    restored.score = state.original.score;
  }

  return restored;
}

function normalizeRatingSubmission(
  previous: GradingResult | null,
  submitted: GradingResult,
  previousSuccess: boolean,
): {
  gradingResult: GradingResult;
  clearingManualRating: boolean;
  hasManualRating: boolean;
} {
  const previousComponents = Array.isArray(previous?.componentResults)
    ? previous.componentResults
    : [];
  const submittedHasComponents = Array.isArray(submitted.componentResults);
  const submittedComponents = Array.isArray(submitted.componentResults)
    ? submitted.componentResults
    : previousComponents;
  const explicitHumanComponent = submittedComponents.find(isHumanGradingResult);
  const explicitTopLevelHuman = isHumanAssertion(submitted.assertion);
  const previousHasManualRating = hasManualRating(previous);
  const clearingManualRating =
    previousHasManualRating &&
    submittedHasComponents &&
    !explicitHumanComponent &&
    !explicitTopLevelHuman;
  const outcomeChanged = previousSuccess !== submitted.pass;
  const shouldHaveManualRating =
    !clearingManualRating &&
    (Boolean(explicitHumanComponent) ||
      explicitTopLevelHuman ||
      previousHasManualRating ||
      outcomeChanged);
  const gradingResult = { ...(previous ?? {}), ...submitted } as GradingResult;

  if (!shouldHaveManualRating) {
    if (clearingManualRating) {
      gradingResult.componentResults = submittedComponents.filter(
        (componentResult) => !isHumanGradingResult(componentResult),
      );
      if (isHumanAssertion(gradingResult.assertion)) {
        delete gradingResult.assertion;
      }
    }
    return { gradingResult, clearingManualRating, hasManualRating: false };
  }

  const previousHumanComponent = previousComponents.find(isHumanGradingResult);
  const humanSource =
    explicitHumanComponent ?? (explicitTopLevelHuman ? submitted : previousHumanComponent);
  const submittedHasReason = Object.hasOwn(submitted, 'reason');
  const manualReason = submittedHasReason
    ? submitted.reason
    : (humanSource?.reason ?? MANUAL_RATING_REASON);
  const humanAssertion = asRecord(humanSource?.assertion);
  const humanRating = {
    ...(humanSource ?? {}),
    pass: submitted.pass,
    score: submitted.score,
    reason: manualReason,
    assertion: { ...(humanAssertion ?? {}), type: HUMAN_ASSERTION_TYPE },
  } as GradingResult;

  if (Object.hasOwn(submitted, 'comment')) {
    humanRating.comment = submitted.comment;
  }
  gradingResult.pass = submitted.pass;
  gradingResult.score = submitted.score;
  gradingResult.reason = manualReason;
  gradingResult.componentResults = [
    ...submittedComponents.filter((componentResult) => !isHumanGradingResult(componentResult)),
    humanRating,
  ];
  if (isHumanAssertion(gradingResult.assertion)) {
    delete gradingResult.assertion;
  }

  return { gradingResult, clearingManualRating: false, hasManualRating: true };
}

function resolveRatingTransition(
  result: PersistedEvalResult,
  submittedGradingResult: GradingResult,
  clearRequestHash: string,
): {
  gradingResult: GradingResult;
  success: boolean;
  score: number;
  failureReason: ResultFailureReason;
  metadata: PersistedEvalResult['metadata'];
} {
  const previousHasManualRating = hasManualRating(result.gradingResult);
  const normalized = normalizeRatingSubmission(
    result.gradingResult,
    submittedGradingResult,
    result.success,
  );
  const existingState = getManualRatingState(result.metadata);
  let nextState: ManualRatingState | undefined;
  let gradingResult = normalized.gradingResult;
  let success = gradingResult.pass;
  let score = gradingResult.score;
  let failureReason: ResultFailureReason = normalized.hasManualRating
    ? success
      ? ResultFailureReason.NONE
      : ResultFailureReason.ASSERT
    : normalizeFailureReason(result.failureReason);

  if (
    !previousHasManualRating &&
    existingState?.status === 'cleared' &&
    existingState.clearRequestHash === clearRequestHash
  ) {
    gradingResult = restoreOriginalGradingResult(gradingResult, existingState);
    success = existingState.original.success;
    score = existingState.original.score;
    failureReason = existingState.original.failureReason;
    nextState = existingState;
  } else if (!previousHasManualRating && normalized.hasManualRating) {
    nextState = captureManualRatingState(result);
  } else if (previousHasManualRating && normalized.hasManualRating) {
    nextState = existingState?.status === 'active' ? existingState : undefined;
  } else if (normalized.clearingManualRating) {
    if (existingState?.status === 'active') {
      gradingResult = restoreOriginalGradingResult(gradingResult, existingState);
      success = existingState.original.success;
      score = existingState.original.score;
      failureReason = existingState.original.failureReason;
      nextState = { ...existingState, status: 'cleared', clearRequestHash };
    } else {
      // Ratings created before provenance was recorded cannot be restored exactly.
      failureReason = success ? ResultFailureReason.NONE : ResultFailureReason.ASSERT;
    }
  }

  gradingResult.pass = success;
  gradingResult.score = score;
  const shouldUpdateManualRatingState = existingState !== undefined || nextState !== undefined;
  const metadata = shouldUpdateManualRatingState
    ? setManualRatingState(result.metadata, nextState)
    : result.metadata;
  return {
    gradingResult,
    success,
    score,
    failureReason,
    metadata: metadata as PersistedEvalResult['metadata'],
  };
}

function countGradingAssertions(gradingResult: GradingResult | null | undefined): {
  pass: number;
  fail: number;
} {
  const componentResults = gradingResult?.componentResults;
  if (!Array.isArray(componentResults)) {
    return { pass: 0, fail: 0 };
  }

  return componentResults.reduce(
    (counts, componentResult: unknown) => {
      if (!componentResult || typeof componentResult !== 'object') {
        return counts;
      }

      const { pass } = componentResult as { pass?: unknown };
      if (pass === true) {
        counts.pass += 1;
      } else if (pass === false) {
        counts.fail += 1;
      }
      return counts;
    },
    { pass: 0, fail: 0 },
  );
}

function hasManualRating(gradingResult: GradingResult | null | undefined): boolean {
  return Boolean(
    isHumanAssertion(gradingResult?.assertion) ||
      (Array.isArray(gradingResult?.componentResults) &&
        gradingResult.componentResults.some(isHumanGradingResult)),
  );
}

function getResultMetricCategory(
  success: boolean,
  failureReason: ResultFailureReason | number | undefined,
): ResultMetricCategory {
  if (success) {
    return 'pass';
  }
  return failureReason === ResultFailureReason.ERROR ? 'error' : 'fail';
}

function applyResultMetricDelta(
  metrics: PromptMetrics,
  previousCategory: ResultMetricCategory,
  nextCategory: ResultMetricCategory,
): void {
  if (previousCategory === nextCategory) {
    return;
  }

  const updateCategory = (category: ResultMetricCategory, delta: number) => {
    if (category === 'pass') {
      metrics.testPassCount += delta;
    } else if (category === 'error') {
      metrics.testErrorCount += delta;
    } else {
      metrics.testFailCount += delta;
    }
  };

  updateCategory(previousCategory, -1);
  updateCategory(nextCategory, 1);
}
function sendEvalTableResponse(res: Response, evalId: string, responsePayload: EvalTableDTO): void {
  let parsedPayload: EvalTableDTO;
  try {
    parsedPayload = EvalSchemas.Table.Response.parse(responsePayload) as unknown as EvalTableDTO;
  } catch (error) {
    sendError(res, 500, 'Failed to render eval table', error);
    return;
  }

  try {
    res.json(parsedPayload);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }

    logger.warn('[GET /:id/table] Response too large, stripping per-cell prompts by size', {
      evalId,
    });

    const promptLocations = getEvalTableOutputPromptLocationsBySize(parsedPayload);
    if (promptLocations.length === 0) {
      logger.error('[GET /:id/table] Response too large and has no prompts to strip', {
        evalId,
      });
      res.status(413).json({ error: 'Eval too large to display. Try reducing the page size.' });
      return;
    }

    const tryStringifyWithStrippedPrompts = (promptCountToStrip: number): string | null => {
      const responseWithoutPrompts = getEvalTablePromptStrippedPayload(
        parsedPayload,
        promptLocations,
        promptCountToStrip,
      );
      try {
        const responseBody = JSON.stringify(responseWithoutPrompts);
        invariant(typeof responseBody === 'string', 'Eval table response must serialize to JSON');
        return responseBody;
      } catch (retryError) {
        if (!(retryError instanceof RangeError)) {
          throw retryError;
        }
        return null;
      }
    };

    let lowerBound = 0;
    let upperBound = 1;
    let responseBody: string | null = null;

    while (upperBound < promptLocations.length) {
      responseBody = tryStringifyWithStrippedPrompts(upperBound);
      if (responseBody) {
        break;
      }
      lowerBound = upperBound;
      upperBound *= 2;
    }

    if (!responseBody) {
      upperBound = promptLocations.length;
      responseBody = tryStringifyWithStrippedPrompts(upperBound);
    }

    if (responseBody) {
      while (upperBound - lowerBound > 1) {
        const midPoint = lowerBound + Math.floor((upperBound - lowerBound) / 2);
        const midpointResponseBody = tryStringifyWithStrippedPrompts(midPoint);
        if (midpointResponseBody) {
          upperBound = midPoint;
          responseBody = midpointResponseBody;
        } else {
          lowerBound = midPoint;
        }
      }

      res.type('json').send(responseBody);
      return;
    }

    logger.error('[GET /:id/table] Response still too large after stripping prompts', {
      evalId,
    });
    res.status(413).json({ error: 'Eval too large to display. Try reducing the page size.' });
  }
}

evalRouter.post('/job', async (req: Request, res: Response): Promise<void> => {
  const result = EvalSchemas.CreateJob.Request.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: z.prettifyError(result.error) });
    return;
  }

  // Use validated data but merge providers from req.body to preserve nested config fields.
  // Provider configs can have arbitrary keys (e.g., custom headers, API options) that
  // nested provider schemas may strip. This keeps Zod transforms/coercions while
  // preserving provider flexibility.
  const {
    evaluateOptions,
    sourceEvalId,
    providers: _validatedProviders,
    ...restData
  } = result.data;
  let testSuite = {
    ...restData,
    // Preserve raw providers from req.body to keep nested config fields
    providers: (req.body as { providers?: unknown }).providers,
  };

  if (sourceEvalId) {
    try {
      const sourceEval = await Eval.findById(sourceEvalId);
      if (sourceEval) {
        testSuite = restoreAzureBlobSasTokens(testSuite, sourceEval.config);
      }
    } catch (error) {
      sendError(res, 500, 'Failed to prepare eval job', error);
      return;
    }
  }

  const id = crypto.randomUUID();
  evalJobService.create(id);

  evaluateWithSource(
    {
      ...(testSuite as EvaluateTestSuite),
      writeLatestResults: true,
      sharing: testSuite.sharing ?? shouldShareResults({}),
    },
    {
      ...evaluateOptions,
      eventSource: 'web',
      progressCallback: (progress: number, total: number) => {
        invariant(evalJobService.setProgress(id, progress, total), 'Job not found');
        console.log(`[${id}] ${progress}/${total}`);
      },
    },
  )
    .then(async (evalResult) => {
      const result = await evalResult.toEvaluateSummary();
      invariant(evalJobService.complete(id, result, evalResult.id), 'Job not found');
      console.log(`[${id}] Complete`);
    })
    .catch((error) => {
      logger.error('Failed to eval tests', {
        error,
        body: sanitizeObject(testSuite, { context: 'request body' }),
      });

      invariant(evalJobService.fail(id, [String(error)]), 'Job not found');
    });

  res.json(EvalSchemas.CreateJob.Response.parse({ id }));
});

evalRouter.get('/job/:id', (req: Request, res: Response): void => {
  const paramsResult = EvalSchemas.GetJob.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const job = evalJobService.get(id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'complete') {
    res.json(
      EvalSchemas.GetJob.Response.parse({
        status: 'complete',
        result: job.result,
        evalId: job.evalId,
        logs: job.logs,
      }),
    );
  } else if (job.status === 'error') {
    res.json(
      EvalSchemas.GetJob.Response.parse({
        status: 'error',
        logs: job.logs,
      }),
    );
  } else {
    res.json(
      EvalSchemas.GetJob.Response.parse({
        status: 'in-progress',
        progress: job.progress,
        total: job.total,
        logs: job.logs,
      }),
    );
  }
});

evalRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Update.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const bodyResult = EvalSchemas.Update.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { table, config } = bodyResult.data;

  try {
    // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with EvaluateTable
    await updateResult(id, config, table as unknown as EvaluateTable | undefined);
    res.json(EvalSchemas.Update.Response.parse({ message: 'Eval updated successfully' }));
  } catch (error) {
    logger.error('[PATCH /api/eval/:id] Failed to update eval', { id, error });
    res.status(500).json({ error: 'Failed to update eval table' });
  }
});

evalRouter.patch('/:id/author', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.UpdateAuthor.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const bodyResult = EvalSchemas.UpdateAuthor.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { author } = bodyResult.data;

  try {
    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    eval_.author = author;
    await eval_.save();

    // NOTE: Side effect. If user email is not set, set it to the author's email
    if (!getUserEmail()) {
      setUserEmail(author);
    }

    res.json(
      EvalSchemas.UpdateAuthor.Response.parse({
        message: 'Author updated successfully',
      }),
    );
  } catch (error) {
    logger.error(`Failed to update eval author: ${error}`);
    res.status(500).json({ error: 'Failed to update eval author' });
  }
});

const UNLIMITED_RESULTS = Number.MAX_SAFE_INTEGER;

evalRouter.get('/:id/table', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Table.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const queryResult = EvalSchemas.Table.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  const { id } = paramsResult.data;

  const {
    format,
    limit: baseLimit,
    offset: baseOffset,
    filterMode,
    search: searchText,
    filter: filters,
    comparisonEvalIds,
  } = queryResult.data;

  // Apply UNLIMITED_RESULTS when format is specified
  const limit = format ? UNLIMITED_RESULTS : baseLimit;
  const offset = format ? 0 : baseOffset;

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    res.status(404).json({ error: 'Eval not found' });
    return;
  }

  // Unified CSV export path - handles both simple and comparison exports
  // This is the same code path used by CLI exports, ensuring consistent output
  if (format === 'csv') {
    try {
      const csvData = await generateEvalCsv(eval_, {
        filterMode,
        searchQuery: searchText,
        filters,
        comparisonEvalIds,
        findEvalById: Eval.findById.bind(Eval),
      });
      setDownloadHeaders(res, `${id}.csv`, 'text/csv');
      res.send(csvData);
      return;
    } catch (error) {
      if (error instanceof ComparisonEvalNotFoundError) {
        res.status(404).json({ error: 'Comparison eval not found' });
        return;
      }
      throw error;
    }
  }

  const table = await eval_.getTablePage({
    offset,
    limit,
    filterMode,
    searchQuery: searchText,
    filters,
  });

  const indices = table.body.map((row) => row.testIdx);

  let returnTable = { head: table.head, body: table.body };

  if (comparisonEvalIds.length > 0) {
    // Fetch comparison evals and their tables, keeping track of eval IDs
    const comparisonData = await Promise.all(
      comparisonEvalIds.map(async (comparisonEvalId) => {
        const comparisonEval_ = await Eval.findById(comparisonEvalId);
        if (!comparisonEval_) {
          return null;
        }
        const comparisonTable = await comparisonEval_.getTablePage({
          offset: 0,
          limit: indices.length,
          filterMode: 'all',
          testIndices: indices,
          searchQuery: searchText,
          filters,
        });
        return { evalId: comparisonEval_.id, table: comparisonTable };
      }),
    );

    // Check if any comparison evals were not found
    if (comparisonData.some((data) => data === null)) {
      res.status(404).json({ error: 'Comparison eval not found' });
      return;
    }

    // Use shared merge function (fixes bug where table.id was incorrectly referenced)
    returnTable = mergeComparisonTables(
      id,
      table,
      comparisonData.filter(
        (data): data is { evalId: string; table: typeof table } => data !== null,
      ),
    );
  }

  // Handle JSON export format (CSV is handled above via unified generateEvalCsv)
  if (format === 'json') {
    const jsonData = evalTableToJson(returnTable);

    setDownloadHeaders(res, `${id}.json`, 'application/json');
    res.json(jsonData);
    return;
  }

  // Calculate filtered metrics when filters are active
  let filteredMetrics: PromptMetrics[] | null = null;
  const hasActiveFilters = filterMode !== 'all' || searchText !== '' || filters.length > 0;

  if (hasActiveFilters) {
    try {
      filteredMetrics = await eval_.getFilteredMetrics({
        filterMode,
        searchQuery: searchText,
        filters,
      });
      logger.debug('[GET /:id/table] Calculated filtered metrics', {
        evalId: id,
        filterMode,
        numPrompts: filteredMetrics.length,
      });

      // Validate that filteredMetrics array length matches prompts array length
      // Note: Use table.head.prompts (base eval) not returnTable.head.prompts (includes comparison evals)
      const expectedLength = table.head.prompts.length;
      if (filteredMetrics.length !== expectedLength) {
        logger.error(
          '[GET /:id/table] Filtered metrics array length mismatch - setting to null to prevent frontend errors',
          {
            evalId: id,
            expectedLength,
            actualLength: filteredMetrics.length,
            filterMode,
            searchText,
            filtersCount: filters.length,
          },
        );
        filteredMetrics = null;
      }
    } catch (error) {
      logger.error('[GET /:id/table] Failed to calculate filtered metrics', { error, evalId: id });
      // Don't fail the request, just return null for filteredMetrics
    }
  }

  const responsePayload = {
    table: returnTable,
    totalCount: table.totalCount,
    filteredCount: table.filteredCount,
    filteredMetrics,
    config: redactAzureBlobSasTokens(eval_.config),
    author: eval_.author || null,
    version: eval_.version(),
    id,
    stats: eval_.getStats(),
  } as EvalTableDTO;

  sendEvalTableResponse(res, id, responsePayload);
});

evalRouter.get('/:id/metadata-keys', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.MetadataKeys.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const queryResult = EvalSchemas.MetadataKeys.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { comparisonEvalIds = [] } = queryResult.data;

  try {
    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    // Validate that comparison evals exist
    if (comparisonEvalIds.length > 0) {
      const comparisonEvals = await Promise.all(
        comparisonEvalIds.map((compId) => Eval.findById(compId)),
      );
      const missingEvals = comparisonEvalIds.filter((_, index) => !comparisonEvals[index]);
      if (missingEvals.length > 0) {
        res.status(400).json({
          error: `Comparison evals not found: ${missingEvals.join(', ')}`,
        });
        return;
      }
    }

    const keys = await EvalQueries.getMetadataKeysFromEval(id, comparisonEvalIds);

    const response = EvalSchemas.MetadataKeys.Response.parse({ keys });
    res.json(response);
  } catch (error) {
    logger.error(
      `Error fetching metadata keys for eval ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(500).json({ error: 'Failed to fetch metadata keys' });
  }
});

evalRouter.get('/:id/metadata-values', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.MetadataValues.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const queryResult = EvalSchemas.MetadataValues.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { key } = queryResult.data;

  try {
    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    const values = await EvalQueries.getMetadataValuesFromEval(id, key);
    const response = EvalSchemas.MetadataValues.Response.parse({ values });
    res.json(response);
  } catch (error) {
    logger.error(
      `Error fetching metadata values for eval ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(500).json({ error: 'Failed to fetch metadata values' });
  }
});

evalRouter.post('/:id/results', async (req: Request, res: Response) => {
  const paramsResult = EvalSchemas.AddResults.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const bodyResult = EvalSchemas.AddResults.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with EvalResult[]
  const results = bodyResult.data as unknown as EvalResult[];

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    res.status(404).json({ error: 'Eval not found' });
    return;
  }
  try {
    await eval_.setResults(results);
  } catch (error) {
    logger.error(`Failed to add results to eval: ${error}`);
    res.status(500).json({ error: 'Failed to add results to eval' });
    return;
  }
  res.status(204).send();
});

evalRouter.post('/replay', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = EvalSchemas.Replay.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { evaluationId, testIndex, prompt, variables } = bodyResult.data;

  try {
    // Load the evaluation to get the provider configuration
    const eval_ = await Eval.findById(evaluationId);
    if (!eval_) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }

    // Get the provider configuration from the eval
    const providers = eval_.config.providers;
    if (!providers) {
      res.status(400).json({ error: 'No providers found in evaluation' });
      return;
    }

    // Handle different provider config formats
    // biome-ignore lint/suspicious/noExplicitAny: FIXME
    let providerConfig: any;
    if (Array.isArray(providers)) {
      if (providers.length === 0) {
        res.status(400).json({ error: 'No providers found in evaluation' });
        return;
      }
      // Use the first provider or the one at the specified test index
      providerConfig = providers[(testIndex ?? 0) % providers.length];
    } else if (typeof providers === 'string' || typeof providers === 'function') {
      providerConfig = providers;
    } else {
      // providers might be a single provider object
      providerConfig = providers;
    }

    // Run the prompt through the provider
    const result = await evaluateWithSource(
      {
        prompts: [
          {
            raw: prompt,
            label: 'Replay', // Add required label field
          },
        ],
        providers: [providerConfig],
        tests: [
          {
            vars: (variables || {}) as Vars,
          },
        ],
      },
      {
        maxConcurrency: 1,
        showProgressBar: false,
        eventSource: 'web',
        cache: false, // Always disable cache for replays to get fresh results
      },
    );

    const summary = await result.toEvaluateSummary();

    // Better output extraction - handle different response structures
    const firstResult = summary.results[0];
    let output: unknown = firstResult?.response?.output;

    // If still no output, try the raw response
    if (output === undefined && firstResult?.response?.raw) {
      output = firstResult.response.raw;
    }

    // Serialize non-string outputs for UI compatibility
    // Frontend expects string output; structured outputs (JSON/tools) would render as [object Object]
    let serializedOutput: string;
    if (output === null || output === undefined) {
      serializedOutput = '';
    } else if (typeof output === 'string') {
      serializedOutput = output;
    } else {
      serializedOutput = JSON.stringify(output, null, 2);
    }

    // Return both output and any error information for debugging
    res.json(
      EvalSchemas.Replay.Response.parse({
        output: serializedOutput,
        error: firstResult?.response?.error,
        response: firstResult?.response, // Include full response for debugging
      }),
    );
  } catch (error) {
    logger.error(`Failed to replay evaluation: ${error}`);
    res.status(500).json({ error: 'Failed to replay evaluation' });
  }
});

evalRouter.post(
  '/:evalId/results/:id/rating',
  async (req: Request, res: Response): Promise<void> => {
    const paramsResult = EvalSchemas.SubmitRating.Params.safeParse(req.params);
    if (!paramsResult.success) {
      replyValidationError(res, paramsResult.error);
      return;
    }

    const bodyResult = EvalSchemas.SubmitRating.Request.safeParse(req.body);
    if (!bodyResult.success) {
      replyValidationError(res, bodyResult.error);
      return;
    }

    try {
      const { evalId, id } = paramsResult.data;
      // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with GradingResult
      const submittedGradingResult = bodyResult.data as unknown as GradingResult;
      const clearRequestHash = sha256(stableJsonStringify(submittedGradingResult));
      const db = await getDb();
      const transactionResult = await db.transaction(async (tx) => {
        const result = await tx
          .select()
          .from(evalResultsTable)
          .where(and(eq(evalResultsTable.id, id), eq(evalResultsTable.evalId, evalId)))
          .get();
        if (!result) {
          return { status: 'result-not-found' as const };
        }

        const evalRow = await tx
          .select({ prompts: evalsTable.prompts })
          .from(evalsTable)
          .where(eq(evalsTable.id, evalId))
          .get();
        if (!evalRow) {
          return { status: 'eval-not-found' as const };
        }

        const prompts = structuredClone(evalRow.prompts ?? []);
        const prompt = prompts[result.promptIdx];
        invariant(prompt, 'Prompt not found');
        if (!prompt.metrics) {
          logger.error(
            `[${id}] This is not normal. Prompt metrics not found for prompt ${result.promptIdx}`,
          );
          return { status: 'prompt-metrics-not-found' as const };
        }

        const previousScore = result.score;
        const previousCategory = getResultMetricCategory(result.success, result.failureReason);
        const previousAssertions = countGradingAssertions(result.gradingResult);
        const transition = resolveRatingTransition(
          result,
          submittedGradingResult,
          clearRequestHash,
        );
        const nextAssertions = countGradingAssertions(transition.gradingResult);
        const nextCategory = getResultMetricCategory(transition.success, transition.failureReason);

        prompt.metrics.score += transition.score - previousScore;
        applyResultMetricDelta(prompt.metrics, previousCategory, nextCategory);
        prompt.metrics.assertPassCount += nextAssertions.pass - previousAssertions.pass;
        prompt.metrics.assertFailCount += nextAssertions.fail - previousAssertions.fail;

        const persistedResult = await tx
          .update(evalResultsTable)
          .set({
            gradingResult: transition.gradingResult,
            success: transition.success,
            score: transition.score,
            failureReason: transition.failureReason,
            metadata: transition.metadata,
            updatedAt: getCurrentTimestamp(),
          })
          .where(and(eq(evalResultsTable.id, id), eq(evalResultsTable.evalId, evalId)))
          .returning()
          .get();
        invariant(persistedResult, 'Result disappeared while submitting rating');

        const evalUpdate = await tx
          .update(evalsTable)
          .set({ prompts })
          .where(eq(evalsTable.id, evalId))
          .run();
        invariant(evalUpdate.rowsAffected === 1, 'Eval disappeared while submitting rating');

        return { status: 'updated' as const, result: persistedResult };
      });

      if (transactionResult.status === 'result-not-found') {
        res.status(404).json({ error: 'Result not found' });
        return;
      }
      if (transactionResult.status === 'eval-not-found') {
        res.status(404).json({ error: 'Eval not found' });
        return;
      }
      if (transactionResult.status === 'prompt-metrics-not-found') {
        res.status(400).json({ error: 'Prompt metrics not found' });
        return;
      }

      notifyEvaluationChanged(evalId);
      const result = new EvalResult({ ...transactionResult.result, persisted: true });
      res.json(EvalSchemas.SubmitRating.Response.parse(result));
    } catch (error) {
      sendError(res, 500, 'Failed to submit rating', error);
    }
  },
);

evalRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = EvalSchemas.Save.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const body = bodyResult.data;
  try {
    if (body.data) {
      // v3 format: { data: { results, config } }
      logger.debug('[POST /api/eval] Saving eval results (v3) to database');
      // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with ResultsFile
      const payload = body.data as unknown as ResultsFile;
      const id = await writeResultsToDatabase(payload.results as EvaluateSummaryV2, payload.config);
      res.json(EvalSchemas.Save.Response.parse({ id }));
    } else {
      // v4 format: { config, prompts, results, ... }
      if (!body.results || !body.config) {
        res.status(400).json({
          error: 'Missing required fields: results and config are required for v4 format',
        });
        return;
      }
      const incEval = body as unknown as Eval;
      logger.debug('[POST /api/eval] Saving eval results (v4) to database');
      const eval_ = await Eval.create(incEval.config, incEval.prompts || [], {
        author: incEval.author,
        // Use !== undefined to handle createdAt=0 (Unix epoch)
        createdAt: incEval.createdAt === undefined ? undefined : new Date(incEval.createdAt),
        results: incEval.results,
        vars: incEval.vars,
      });
      if (incEval.prompts) {
        await eval_.addPrompts(incEval.prompts);
      }
      logger.debug(`[POST /api/eval] Eval created with ID: ${eval_.id}`);

      logger.debug(`[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`);

      res.json(EvalSchemas.Save.Response.parse({ id: eval_.id }));
    }
  } catch (error) {
    logger.error('Failed to write eval to database', {
      error,
      body: sanitizeObject(body, { context: 'request body' }),
    });
    res.status(500).json({ error: 'Failed to write eval to database' });
  }
});

evalRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Delete.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  try {
    await deleteEval(id);
    res.json(EvalSchemas.Delete.Response.parse({ message: 'Eval deleted successfully' }));
  } catch (error) {
    logger.error('[DELETE /eval/:id] Failed to delete eval', {
      evalId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.message === `Eval with ID ${id} not found`) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }

    res.status(500).json({ error: 'Failed to delete eval' });
  }
});

/**
 * Bulk delete evals.
 */
evalRouter.delete('/', async (req: Request, res: Response) => {
  const bodyResult = EvalSchemas.BulkDelete.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { ids } = bodyResult.data;

  try {
    await deleteEvals(ids);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete evals' });
  }
});

/**
 * Copy an eval with all its results and relationships.
 */
evalRouter.post('/:id/copy', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Copy.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const bodyResult = EvalSchemas.Copy.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { description } = bodyResult.data;

  try {
    const sourceEval = await Eval.findById(id);
    if (!sourceEval) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    // Get distinct test count for response and pass to copy to avoid duplicate query
    const distinctTestCount = await sourceEval.getResultsCount();

    // Create copy
    const newEval = await sourceEval.copy(description, distinctTestCount);

    logger.info('Eval copied via API', {
      sourceEvalId: id,
      targetEvalId: newEval.id,
      distinctTestCount,
    });

    const response = EvalSchemas.Copy.Response.parse({
      id: newEval.id,
      distinctTestCount,
    });

    res.status(201).json(response);
  } catch (error) {
    logger.error('Failed to copy eval', {
      error,
      evalId: id,
    });
    res.status(500).json({ error: 'Failed to copy evaluation' });
  }
});
