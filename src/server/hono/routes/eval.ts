/**
 * Evaluation routes for the local web UI.
 */

import dedent from 'dedent';
import { Hono } from 'hono';
import { z } from 'zod';

import { HUMAN_ASSERTION_TYPE } from '../../../constants';
import { getUserEmail, setUserEmail } from '../../../globalConfig/accounts';
import promptfoo from '../../../index';
import logger from '../../../logger';
import Eval, { EvalQueries } from '../../../models/eval';
import EvalResult from '../../../models/evalResult';
import { EvalResultsFilterMode } from '../../../types/index';
import { deleteEval, deleteEvals, updateResult, writeResultsToDatabase } from '../../../util/database';
import invariant from '../../../util/invariant';
import { ApiSchemas } from '../../apiSchemas';
import { getDownloadHeaders } from '../../utils/downloadHelpers';
import {
  ComparisonEvalNotFoundError,
  evalTableToJson,
  generateEvalCsv,
  mergeComparisonTables,
} from '../../utils/evalTableUtils';

import type {
  EvalTableDTO,
  EvaluateSummaryV2,
  EvaluateTestSuiteWithEvaluateOptions,
  GradingResult,
  Job,
  PromptMetrics,
  ResultsFile,
} from '../../../index';

export const evalRouter = new Hono();

// Running jobs - exported for use by redteam router
export const evalJobs = new Map<string, Job>();

// Query parameter schemas
const evalTableQuerySchema = z.object({
  format: z.string().optional(),
  limit: z.coerce.number().positive().prefault(50),
  offset: z.coerce.number().nonnegative().prefault(0),
  filterMode: EvalResultsFilterMode.prefault('all'),
  search: z.string().prefault(''),
  filter: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .prefault([]),
  comparisonEvalIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .prefault([]),
});

const UNLIMITED_RESULTS = Number.MAX_SAFE_INTEGER;

/**
 * POST /api/eval/job
 *
 * Start a new evaluation job.
 */
evalRouter.post('/job', async (c) => {
  const body = await c.req.json();
  const { evaluateOptions, ...testSuite } = body as EvaluateTestSuiteWithEvaluateOptions;
  const id = crypto.randomUUID();

  evalJobs.set(id, {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: 0,
    result: null,
    logs: [],
  });

  promptfoo
    .evaluate(
      Object.assign({}, testSuite, {
        writeLatestResults: true,
        sharing: testSuite.sharing ?? true,
      }),
      Object.assign({}, evaluateOptions, {
        eventSource: 'web',
        progressCallback: (progress: number, total: number) => {
          const job = evalJobs.get(id);
          invariant(job, 'Job not found');
          job.progress = progress;
          job.total = total;
          console.log(`[${id}] ${progress}/${total}`);
        },
      }),
    )
    .then(async (result) => {
      const job = evalJobs.get(id);
      invariant(job, 'Job not found');
      job.status = 'complete';
      job.result = await result.toEvaluateSummary();
      job.evalId = result.id;
      console.log(`[${id}] Complete`);
    })
    .catch((error) => {
      logger.error(dedent`Failed to eval tests:
        Error: ${error}
        Body: ${JSON.stringify(body, null, 2)}`);

      const job = evalJobs.get(id);
      invariant(job, 'Job not found');
      job.status = 'error';
      job.result = null;
      job.evalId = null;
      job.logs = [String(error)];
    });

  return c.json({ id });
});

/**
 * GET /api/eval/job/:id
 *
 * Get the status of an evaluation job.
 */
evalRouter.get('/job/:id', (c) => {
  const id = c.req.param('id');
  const job = evalJobs.get(id);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (job.status === 'complete') {
    return c.json({
      status: 'complete',
      result: job.result,
      evalId: job.evalId,
      logs: job.logs,
    });
  } else if (job.status === 'error') {
    return c.json({
      status: 'error',
      logs: job.logs,
    });
  } else {
    return c.json({
      status: 'in-progress',
      progress: job.progress,
      total: job.total,
      logs: job.logs,
    });
  }
});

/**
 * PATCH /api/eval/:id
 *
 * Update an evaluation.
 */
evalRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const { table, config } = await c.req.json();

  if (!id) {
    return c.json({ error: 'Missing id' }, 400);
  }

  try {
    await updateResult(id, config, table);
    return c.json({ message: 'Eval updated successfully' });
  } catch {
    return c.json({ error: 'Failed to update eval table' }, 500);
  }
});

/**
 * PATCH /api/eval/:id/author
 *
 * Update the author of an evaluation.
 */
evalRouter.patch('/:id/author', async (c) => {
  try {
    const { id } = ApiSchemas.Eval.UpdateAuthor.Params.parse({ id: c.req.param('id') });
    const body = await c.req.json();
    const { author } = ApiSchemas.Eval.UpdateAuthor.Request.parse(body);

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      return c.json({ error: 'Eval not found' }, 404);
    }
    if (!author) {
      return c.json({ error: 'No author provided' }, 400);
    }

    eval_.author = author;
    await eval_.save();

    if (!getUserEmail()) {
      setUserEmail(author);
    }

    return c.json(
      ApiSchemas.Eval.UpdateAuthor.Response.parse({
        message: 'Author updated successfully',
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: z.prettifyError(error) }, 400);
    } else {
      logger.error(`Failed to update eval author: ${error}`);
      return c.json({ error: 'Failed to update eval author' }, 500);
    }
  }
});

/**
 * GET /api/eval/:id/table
 *
 * Get the table view of an evaluation.
 */
evalRouter.get('/:id/table', async (c) => {
  const id = c.req.param('id');

  const queryResult = evalTableQuerySchema.safeParse(c.req.query());

  if (!queryResult.success) {
    return c.json({ error: z.prettifyError(queryResult.error) }, 400);
  }

  const {
    format,
    limit: baseLimit,
    offset: baseOffset,
    filterMode,
    search: searchText,
    filter: filters,
    comparisonEvalIds,
  } = queryResult.data;

  const limit = format ? UNLIMITED_RESULTS : baseLimit;
  const offset = format ? 0 : baseOffset;

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    return c.json({ error: 'Eval not found' }, 404);
  }

  // CSV export
  if (format === 'csv') {
    try {
      const csvData = await generateEvalCsv(eval_, {
        filterMode,
        searchQuery: searchText,
        filters: filters as string[],
        comparisonEvalIds: comparisonEvalIds as string[],
        findEvalById: Eval.findById.bind(Eval),
      });
      const headers = getDownloadHeaders(`${id}.csv`, 'text/csv');
      return new Response(csvData, { headers });
    } catch (error) {
      if (error instanceof ComparisonEvalNotFoundError) {
        return c.json({ error: 'Comparison eval not found' }, 404);
      }
      throw error;
    }
  }

  const table = await eval_.getTablePage({
    offset,
    limit,
    filterMode,
    searchQuery: searchText,
    filters: filters as string[],
  });

  const indices = table.body.map((row) => row.testIdx);

  let returnTable = { head: table.head, body: table.body };

  if (comparisonEvalIds.length > 0) {
    const comparisonData = await Promise.all(
      comparisonEvalIds.map(async (comparisonEvalId) => {
        const comparisonEval_ = await Eval.findById(comparisonEvalId as string);
        if (!comparisonEval_) {
          return null;
        }
        const comparisonTable = await comparisonEval_.getTablePage({
          offset: 0,
          limit: indices.length,
          filterMode: 'all',
          testIndices: indices,
          searchQuery: searchText,
          filters: filters as string[],
        });
        return { evalId: comparisonEval_.id, table: comparisonTable };
      }),
    );

    if (comparisonData.some((data) => data === null)) {
      return c.json({ error: 'Comparison eval not found' }, 404);
    }

    returnTable = mergeComparisonTables(
      id,
      table,
      comparisonData.filter(
        (data): data is { evalId: string; table: typeof table } => data !== null,
      ),
    );
  }

  // JSON export
  if (format === 'json') {
    const jsonData = evalTableToJson(returnTable);
    const headers = getDownloadHeaders(`${id}.json`, 'application/json');
    return new Response(JSON.stringify(jsonData), {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    });
  }

  // Calculate filtered metrics
  let filteredMetrics: PromptMetrics[] | null = null;
  const hasActiveFilters = filterMode !== 'all' || searchText !== '' || filters.length > 0;

  if (hasActiveFilters) {
    try {
      filteredMetrics = await eval_.getFilteredMetrics({
        filterMode,
        searchQuery: searchText,
        filters: filters as string[],
      });
      logger.debug('[GET /:id/table] Calculated filtered metrics', {
        evalId: id,
        filterMode,
        numPrompts: filteredMetrics.length,
      });

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
    }
  }

  return c.json({
    table: returnTable,
    totalCount: table.totalCount,
    filteredCount: table.filteredCount,
    filteredMetrics,
    config: eval_.config,
    author: eval_.author || null,
    version: eval_.version(),
    id,
    stats: eval_.getStats(),
  } as EvalTableDTO);
});

/**
 * GET /api/eval/:id/metadata-keys
 *
 * Get metadata keys for an evaluation.
 */
evalRouter.get('/:id/metadata-keys', async (c) => {
  try {
    const { id } = ApiSchemas.Eval.MetadataKeys.Params.parse({ id: c.req.param('id') });
    const { comparisonEvalIds = [] } = ApiSchemas.Eval.MetadataKeys.Query.parse(c.req.query());

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      return c.json({ error: 'Eval not found' }, 404);
    }

    if (comparisonEvalIds.length > 0) {
      const comparisonEvals = await Promise.all(
        comparisonEvalIds.map((compId) => Eval.findById(compId)),
      );
      const missingEvals = comparisonEvalIds.filter((_, index) => !comparisonEvals[index]);
      if (missingEvals.length > 0) {
        return c.json(
          {
            error: `Comparison evals not found: ${missingEvals.join(', ')}`,
          },
          400,
        );
      }
    }

    const keys = await EvalQueries.getMetadataKeysFromEval(id, comparisonEvalIds);

    const response = ApiSchemas.Eval.MetadataKeys.Response.parse({ keys });
    return c.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: z.prettifyError(error) }, 400);
    }

    const id = c.req.param('id');
    logger.error(
      `Error fetching metadata keys for eval ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json({ error: 'Failed to fetch metadata keys' }, 500);
  }
});

/**
 * GET /api/eval/:id/metadata-values
 *
 * Get metadata values for a specific key.
 */
evalRouter.get('/:id/metadata-values', async (c) => {
  try {
    const { id } = ApiSchemas.Eval.MetadataValues.Params.parse({ id: c.req.param('id') });
    const { key } = ApiSchemas.Eval.MetadataValues.Query.parse(c.req.query());

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      return c.json({ error: 'Eval not found' }, 404);
    }

    const values = EvalQueries.getMetadataValuesFromEval(id, key);
    const response = ApiSchemas.Eval.MetadataValues.Response.parse({ values });
    return c.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: z.prettifyError(error) }, 400);
    }

    const id = c.req.param('id');
    logger.error(
      `Error fetching metadata values for eval ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json({ error: 'Failed to fetch metadata values' }, 500);
  }
});

/**
 * POST /api/eval/:id/results
 *
 * Add results to an evaluation.
 */
evalRouter.post('/:id/results', async (c) => {
  const id = c.req.param('id');
  const results = (await c.req.json()) as unknown as EvalResult[];

  if (!Array.isArray(results)) {
    return c.json({ error: 'Results must be an array' }, 400);
  }

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    return c.json({ error: 'Eval not found' }, 404);
  }

  try {
    await eval_.setResults(results);
  } catch (error) {
    logger.error(`Failed to add results to eval: ${error}`);
    return c.json({ error: 'Failed to add results to eval' }, 500);
  }

  return c.body(null, 204);
});

/**
 * POST /api/eval/replay
 *
 * Replay an evaluation.
 */
evalRouter.post('/replay', async (c) => {
  const { evaluationId, testIndex, prompt, variables } = await c.req.json();

  if (!evaluationId || !prompt) {
    return c.json({ error: 'Missing required parameters' }, 400);
  }

  try {
    const eval_ = await Eval.findById(evaluationId);
    if (!eval_) {
      return c.json({ error: 'Evaluation not found' }, 404);
    }

    const providers = eval_.config.providers;
    if (!providers) {
      return c.json({ error: 'No providers found in evaluation' }, 400);
    }

    // biome-ignore lint/suspicious/noExplicitAny: FIXME
    let providerConfig: any;
    if (Array.isArray(providers)) {
      if (providers.length === 0) {
        return c.json({ error: 'No providers found in evaluation' }, 400);
      }
      providerConfig = providers[testIndex % providers.length];
    } else if (typeof providers === 'string' || typeof providers === 'function') {
      providerConfig = providers;
    } else {
      providerConfig = providers;
    }

    const result = await promptfoo.evaluate(
      {
        prompts: [
          {
            raw: prompt,
            label: 'Replay',
          },
        ],
        providers: [providerConfig],
        tests: [
          {
            vars: variables || {},
          },
        ],
      },
      {
        maxConcurrency: 1,
        showProgressBar: false,
        eventSource: 'web',
        cache: false,
      },
    );

    const summary = await result.toEvaluateSummary();

    const firstResult = summary.results[0];
    let output = firstResult?.response?.output;

    if (!output && firstResult?.response?.raw) {
      output = firstResult.response.raw;
    }

    return c.json({
      output: output || '',
      error: firstResult?.response?.error,
      response: firstResult?.response,
    });
  } catch (error) {
    logger.error(`Failed to replay evaluation: ${error}`);
    return c.json({ error: 'Failed to replay evaluation' }, 500);
  }
});

/**
 * POST /api/eval/:evalId/results/:id/rating
 *
 * Update the rating of a result.
 */
evalRouter.post('/:evalId/results/:id/rating', async (c) => {
  const id = c.req.param('id');
  const gradingResult = (await c.req.json()) as GradingResult;
  const result = await EvalResult.findById(id);
  invariant(result, 'Result not found');
  const eval_ = await Eval.findById(result.evalId);
  invariant(eval_, 'Eval not found');

  const hasExistingManualOverride = Boolean(
    result.gradingResult?.componentResults?.some((r) => r.assertion?.type === HUMAN_ASSERTION_TYPE),
  );
  const successChanged = result.success !== gradingResult.pass;
  const scoreChange = gradingResult.score - result.score;

  result.gradingResult = gradingResult;
  result.success = gradingResult.pass;
  result.score = gradingResult.score;

  const prompt = eval_.prompts[result.promptIdx];
  invariant(prompt, 'Prompt not found');
  if (!prompt.metrics) {
    logger.error(
      `[${id}] This is not normal. Prompt metrics not found for prompt ${result.promptIdx}`,
    );
    return c.json({ error: 'Prompt metrics not found' }, 400);
  }

  if (successChanged) {
    if (result.success) {
      prompt.metrics.testPassCount += 1;
      prompt.metrics.testFailCount -= 1;
      prompt.metrics.assertPassCount += 1;
      prompt.metrics.score += scoreChange;
      if (hasExistingManualOverride) {
        prompt.metrics.assertFailCount -= 1;
      }
    } else {
      prompt.metrics.testPassCount -= 1;
      prompt.metrics.testFailCount += 1;
      prompt.metrics.assertFailCount += 1;
      prompt.metrics.score += scoreChange;
      if (hasExistingManualOverride) {
        prompt.metrics.assertPassCount -= 1;
      }
    }
  } else if (!hasExistingManualOverride) {
    if (result.success) {
      prompt.metrics.assertPassCount += 1;
    } else {
      prompt.metrics.assertFailCount += 1;
    }
  }

  await eval_.save();
  await result.save();

  return c.json(result);
});

/**
 * POST /api/eval
 *
 * Create a new evaluation.
 */
evalRouter.post('/', async (c) => {
  const body = await c.req.json();
  try {
    if (body.data) {
      logger.debug('[POST /api/eval] Saving eval results (v3) to database');
      const { data: payload } = body as { data: ResultsFile };
      const id = await writeResultsToDatabase(payload.results as EvaluateSummaryV2, payload.config);
      return c.json({ id });
    } else {
      const incEval = body as unknown as Eval;
      logger.debug('[POST /api/eval] Saving eval results (v4) to database');
      const eval_ = await Eval.create(incEval.config, incEval.prompts || [], {
        author: incEval.author,
        createdAt: new Date(incEval.createdAt),
        results: incEval.results,
        vars: incEval.vars,
      });
      if (incEval.prompts) {
        eval_.addPrompts(incEval.prompts);
      }
      logger.debug(`[POST /api/eval] Eval created with ID: ${eval_.id}`);
      logger.debug(`[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`);

      return c.json({ id: eval_.id });
    }
  } catch (error) {
    logger.error(dedent`Failed to write eval to database:
      Error: ${error}
      Body: ${JSON.stringify(body, null, 2)}`);
    return c.json({ error: 'Failed to write eval to database' }, 500);
  }
});

/**
 * DELETE /api/eval/:id
 *
 * Delete an evaluation.
 */
evalRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await deleteEval(id);
    return c.json({ message: 'Eval deleted successfully' });
  } catch (error) {
    logger.error('[DELETE /eval/:id] Failed to delete eval', {
      evalId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.message === `Eval with ID ${id} not found`) {
      return c.json({ error: 'Evaluation not found' }, 404);
    }

    return c.json({ error: 'Failed to delete eval' }, 500);
  }
});

/**
 * DELETE /api/eval
 *
 * Bulk delete evaluations.
 */
evalRouter.delete('/', async (c) => {
  const { ids } = await c.req.json();
  if (!Array.isArray(ids)) {
    return c.json({ error: 'Ids must be an array' }, 400);
  }

  try {
    deleteEvals(ids);
    return c.body(null, 204);
  } catch {
    return c.json({ error: 'Failed to delete evals' }, 500);
  }
});

/**
 * POST /api/eval/:id/copy
 *
 * Copy an evaluation.
 */
evalRouter.post('/:id/copy', async (c) => {
  try {
    const { id } = ApiSchemas.Eval.Copy.Params.parse({ id: c.req.param('id') });
    const body = await c.req.json();
    const { description } = ApiSchemas.Eval.Copy.Request.parse(body);

    const sourceEval = await Eval.findById(id);
    if (!sourceEval) {
      return c.json({ error: 'Eval not found' }, 404);
    }

    const distinctTestCount = await sourceEval.getResultsCount();
    const newEval = await sourceEval.copy(description, distinctTestCount);

    logger.info('Eval copied via API', {
      sourceEvalId: id,
      targetEvalId: newEval.id,
      distinctTestCount,
    });

    const response = ApiSchemas.Eval.Copy.Response.parse({
      id: newEval.id,
      distinctTestCount,
    });

    return c.json(response, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: z.prettifyError(error) }, 400);
    }

    logger.error('Failed to copy eval', {
      error,
      evalId: c.req.param('id'),
    });
    return c.json({ error: 'Failed to copy evaluation' }, 500);
  }
});

export default evalRouter;
