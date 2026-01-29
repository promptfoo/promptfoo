import dedent from 'dedent';
import { Router } from 'express';
import { z } from 'zod';
import { HUMAN_ASSERTION_TYPE } from '../../constants';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import promptfoo from '../../index';
import logger from '../../logger';
import Eval, { EvalQueries } from '../../models/eval';
import EvalResult from '../../models/evalResult';
import { EvalSchemas } from '../../types/api/eval';
import { deleteEval, deleteEvals, updateResult, writeResultsToDatabase } from '../../util/database';
import invariant from '../../util/invariant';
import { setDownloadHeaders } from '../utils/downloadHelpers';
import {
  ComparisonEvalNotFoundError,
  evalTableToJson,
  generateEvalCsv,
  mergeComparisonTables,
} from '../utils/evalTableUtils';
import type { Request, Response } from 'express';

import type {
  EvalTableDTO,
  EvaluateSummaryV2,
  EvaluateTable,
  EvaluateTestSuite,
  GradingResult,
  Job,
  PromptMetrics,
  ResultsFile,
  Vars,
} from '../../index';

export const evalRouter = Router();

// Running jobs
export const evalJobs = new Map<string, Job>();

evalRouter.post('/job', (req: Request, res: Response): void => {
  const result = EvalSchemas.CreateJob.Request.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: z.prettifyError(result.error) });
    return;
  }

  // Use validated data but merge providers from req.body to preserve nested config fields.
  // Provider configs can have arbitrary keys (e.g., custom headers, API options) that
  // nested provider schemas may strip. This keeps Zod transforms/coercions while
  // preserving provider flexibility.
  const { evaluateOptions, providers: _validatedProviders, ...restData } = result.data;
  const testSuite = {
    ...restData,
    // Preserve raw providers from req.body to keep nested config fields
    providers: (req.body as { providers?: unknown }).providers,
  };
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
      Object.assign({}, testSuite as EvaluateTestSuite, {
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
    .then(async (evalResult) => {
      const job = evalJobs.get(id);
      invariant(job, 'Job not found');
      job.status = 'complete';
      job.result = await evalResult.toEvaluateSummary();
      job.evalId = evalResult.id;
      console.log(`[${id}] Complete`);
    })
    .catch((error) => {
      logger.error(dedent`Failed to eval tests:
        Error: ${error}
        Body: ${JSON.stringify(req.body, null, 2)}`);

      const job = evalJobs.get(id);
      invariant(job, 'Job not found');
      job.status = 'error';
      job.result = null;
      job.evalId = null;
      job.logs = [String(error)];
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
  const job = evalJobs.get(id);
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
  } catch {
    res.status(500).json({ error: 'Failed to update eval table' });
  }
});

evalRouter.patch('/:id/author', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = EvalSchemas.UpdateAuthor.Params.parse(req.params);
    const { author } = EvalSchemas.UpdateAuthor.Request.parse(req.body);

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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: z.prettifyError(error) });
    } else {
      logger.error(`Failed to update eval author: ${error}`);
      res.status(500).json({ error: 'Failed to update eval author' });
    }
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

  // Default response for table view
  res.json({
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

evalRouter.get('/:id/metadata-keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = EvalSchemas.MetadataKeys.Params.parse(req.params);
    const { comparisonEvalIds = [] } = EvalSchemas.MetadataKeys.Query.parse(req.query);

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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: z.prettifyError(error) });
      return;
    }

    const { id } = req.params;
    logger.error(
      `Error fetching metadata keys for eval ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(500).json({ error: 'Failed to fetch metadata keys' });
  }
});

evalRouter.get('/:id/metadata-values', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = EvalSchemas.MetadataValues.Params.parse(req.params);
    const { key } = EvalSchemas.MetadataValues.Query.parse(req.query);

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    const values = EvalQueries.getMetadataValuesFromEval(id, key);
    const response = EvalSchemas.MetadataValues.Response.parse({ values });
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: z.prettifyError(error) });
      return;
    }

    const { id } = req.params;
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
    const result = await promptfoo.evaluate(
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
      res.status(400).json({ error: z.prettifyError(paramsResult.error) });
      return;
    }

    const bodyResult = EvalSchemas.SubmitRating.Request.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: z.prettifyError(bodyResult.error) });
      return;
    }

    const { id } = paramsResult.data;
    // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with GradingResult
    const gradingResult = bodyResult.data as unknown as GradingResult;
    const result = await EvalResult.findById(id);
    invariant(result, 'Result not found');
    const eval_ = await Eval.findById(result.evalId);
    invariant(eval_, 'Eval not found');

    // Capture the current state before we change it
    const hasExistingManualOverride = Boolean(
      result.gradingResult?.componentResults?.some(
        (r) => r.assertion?.type === HUMAN_ASSERTION_TYPE,
      ),
    );
    const successChanged = result.success !== gradingResult.pass;
    const scoreChange = gradingResult.score - result.score;

    // Update the result
    result.gradingResult = gradingResult;
    result.success = gradingResult.pass;
    result.score = gradingResult.score;

    // Update the prompt metrics
    const prompt = eval_.prompts[result.promptIdx];
    invariant(prompt, 'Prompt not found');
    if (!prompt.metrics) {
      logger.error(
        `[${id}] This is not normal. Prompt metrics not found for prompt ${result.promptIdx}`,
      );

      res.status(400).json({ error: 'Prompt metrics not found' });
      return;
    }

    if (successChanged) {
      if (result.success) {
        // Result changed from fail to pass
        prompt.metrics.testPassCount += 1;
        prompt.metrics.testFailCount -= 1;
        prompt.metrics.assertPassCount += 1;
        prompt.metrics.score += scoreChange;
        if (hasExistingManualOverride) {
          // If there was an existing manual override, we need to decrement the assertFailCount because it changed from fail to pass
          prompt.metrics.assertFailCount -= 1;
        }
      } else {
        prompt.metrics.testPassCount -= 1;
        prompt.metrics.testFailCount += 1;
        prompt.metrics.assertFailCount += 1;
        prompt.metrics.score += scoreChange;
        if (hasExistingManualOverride) {
          // If there was an existing manual override, we need to decrement the assertPassCount because it changed from pass to fail
          prompt.metrics.assertPassCount -= 1;
        }
      }
    } else if (!hasExistingManualOverride) {
      // Nothing changed, so the user just added an assertion
      if (result.success) {
        prompt.metrics.assertPassCount += 1;
      } else {
        prompt.metrics.assertFailCount += 1;
      }
    }

    await eval_.save();
    await result.save();

    res.json(result);
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
        createdAt: incEval.createdAt !== undefined ? new Date(incEval.createdAt) : undefined,
        results: incEval.results,
        vars: incEval.vars,
      });
      if (incEval.prompts) {
        eval_.addPrompts(incEval.prompts);
      }
      logger.debug(`[POST /api/eval] Eval created with ID: ${eval_.id}`);

      logger.debug(`[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`);

      res.json(EvalSchemas.Save.Response.parse({ id: eval_.id }));
    }
  } catch (error) {
    logger.error(dedent`Failed to write eval to database:
      Error: ${error}
      Body: ${JSON.stringify(body, null, 2)}`);
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
evalRouter.delete('/', (req: Request, res: Response) => {
  const bodyResult = EvalSchemas.BulkDelete.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { ids } = bodyResult.data;

  try {
    deleteEvals(ids);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete evals' });
  }
});

/**
 * Copy an eval with all its results and relationships.
 */
evalRouter.post('/:id/copy', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = EvalSchemas.Copy.Params.parse(req.params);
    const { description } = EvalSchemas.Copy.Request.parse(req.body);

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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: z.prettifyError(error) });
      return;
    }

    logger.error('Failed to copy eval', {
      error,
      evalId: req.params.id,
    });
    res.status(500).json({ error: 'Failed to copy evaluation' });
  }
});
