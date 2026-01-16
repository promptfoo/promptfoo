import crypto from 'crypto';

import async from 'async';
import dedent from 'dedent';
import { Router } from 'express';
import { z } from 'zod';
import { AssertionsResult } from '../../assertions/assertionsResult';
import { renderMetricName, runAssertions } from '../../assertions/index';
import { DEFAULT_MAX_CONCURRENCY } from '../../constants';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import promptfoo from '../../index';
import logger from '../../logger';
import Eval, { EvalQueries } from '../../models/eval';
import EvalResult from '../../models/evalResult';
import {
  AssertionOrSetSchema,
  EvalResultsFilterMode,
  ResultFailureReason,
} from '../../types/index';
import { deleteEval, deleteEvals, updateResult, writeResultsToDatabase } from '../../util/database';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { recalculatePromptMetrics } from '../../util/recalculatePromptMetrics';
import { ApiSchemas } from '../apiSchemas';
import { setDownloadHeaders } from '../utils/downloadHelpers';
import { evalTableToCsv, evalTableToJson } from '../utils/evalTableUtils';
import type { Request, Response } from 'express';

import type {
  AssertionOrSet,
  AtomicTestCase,
  EvalTableDTO,
  EvaluateSummaryV2,
  EvaluateTestSuiteWithEvaluateOptions,
  GradingResult,
  Job,
  PromptMetrics,
  ResultsFile,
} from '../../index';

export const evalRouter = Router();

// Running jobs
export const evalJobs = new Map<string, Job>();

// Assertion job types
export interface AssertionJobResult {
  resultId: string;
  pass: boolean;
  score: number;
  error?: string;
}

export interface AssertionJob {
  evalId: string;
  status: 'in-progress' | 'complete' | 'error';
  progress: number;
  total: number;
  completedResults: AssertionJobResult[];
  updatedResults: number;
  skippedResults: number;
  skippedAssertions: number;
  errors: { resultId: string; error: string }[];
  matchedTestCount?: number;
}

export const assertionJobs = new Map<string, AssertionJob>();

const PosthocResultsFilterSchema = z.object({
  type: z.string(),
  operator: z.string(),
  value: z.string().optional(),
  field: z.string().optional(),
  logicOperator: z.enum(['and', 'or']).optional(),
});

const PosthocAssertionsScopeSchema = z.object({
  type: z.enum(['results', 'tests', 'filtered']),
  resultIds: z.array(z.string()).optional(),
  testIndices: z.array(z.number()).optional(),
  filters: z.array(PosthocResultsFilterSchema).optional(),
  filterMode: EvalResultsFilterMode.optional(),
  searchText: z.string().optional(),
});

const PosthocAssertionsSchema = z.object({
  assertions: z.array(AssertionOrSetSchema).min(1),
  scope: PosthocAssertionsScopeSchema,
});

function assertionKey(assertion: AssertionOrSet): string {
  return safeJsonStringify(assertion) ?? JSON.stringify(assertion);
}

function getTopLevelComponentResults(componentResults: GradingResult[]): GradingResult[] {
  const nestedResults = new Set<string>();

  for (const result of componentResults) {
    if (result.componentResults && result.componentResults.length > 0) {
      for (const subResult of result.componentResults) {
        const serialized = safeJsonStringify(subResult);
        if (serialized) {
          nestedResults.add(serialized);
        }
      }
    }
  }

  return componentResults.filter((result) => {
    const serialized = safeJsonStringify(result);
    return !serialized || !nestedResults.has(serialized);
  });
}

async function recomputeAggregateGradingResult(
  componentResults: GradingResult[],
  testCase: AtomicTestCase,
): Promise<GradingResult> {
  const assertionResults = new AssertionsResult({ threshold: testCase.threshold });
  const topLevelResults = getTopLevelComponentResults(componentResults);

  topLevelResults.forEach((result, index) => {
    if (!result.assertion) {
      return;
    }
    const metric = renderMetricName(result.assertion.metric, testCase.vars || {});
    assertionResults.addResult({
      index,
      result,
      metric,
      weight: result.assertion.weight,
    });
  });

  return assertionResults.testResult();
}

evalRouter.post('/job', (req: Request, res: Response): void => {
  const { evaluateOptions, ...testSuite } = req.body as EvaluateTestSuiteWithEvaluateOptions;
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
        Body: ${JSON.stringify(req.body, null, 2)}`);

      const job = evalJobs.get(id);
      invariant(job, 'Job not found');
      job.status = 'error';
      job.result = null;
      job.evalId = null;
      job.logs = [String(error)];
    });

  res.json({ id });
});

evalRouter.get('/job/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const job = evalJobs.get(id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status === 'complete') {
    res.json({
      status: 'complete',
      result: job.result,
      evalId: job.evalId,
      logs: job.logs,
    });
  } else if (job.status === 'error') {
    res.json({
      status: 'error',
      logs: job.logs,
    });
  } else {
    res.json({
      status: 'in-progress',
      progress: job.progress,
      total: job.total,
      logs: job.logs,
    });
  }
});

evalRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { table, config } = req.body;

  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }

  try {
    await updateResult(id, config, table);
    res.json({ message: 'Eval updated successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to update eval table' });
  }
});

evalRouter.patch('/:id/author', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = ApiSchemas.Eval.UpdateAuthor.Params.parse(req.params);
    const { author } = ApiSchemas.Eval.UpdateAuthor.Request.parse(req.body);

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }
    if (!author) {
      res.status(400).json({ error: 'No author provided' });
      return;
    }

    eval_.author = author;
    await eval_.save();

    // NOTE: Side effect. If user email is not set, set it to the author's email
    if (!getUserEmail()) {
      setUserEmail(author);
    }

    res.json(
      ApiSchemas.Eval.UpdateAuthor.Response.parse({
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

evalRouter.get('/:id/table', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  // Parse and validate query parameters
  const queryResult = evalTableQuerySchema.safeParse(req.query);

  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
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

  // Apply UNLIMITED_RESULTS when format is specified
  const limit = format ? UNLIMITED_RESULTS : baseLimit;
  const offset = format ? 0 : baseOffset;

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    res.status(404).json({ error: 'Eval not found' });
    return;
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
    const comparisonEvals = await Promise.all(
      comparisonEvalIds.map(async (comparisonEvalId) => {
        const comparisonEval_ = await Eval.findById(comparisonEvalId as string);
        return comparisonEval_;
      }),
    );

    if (comparisonEvals.some((comparisonEval_) => !comparisonEval_)) {
      res.status(404).json({ error: 'Comparison eval not found' });
      return;
    }

    const comparisonTables = await Promise.all(
      comparisonEvals.map(async (comparisonEval_) => {
        invariant(comparisonEval_, 'Comparison eval not found');
        return comparisonEval_.getTablePage({
          offset: 0,
          limit: indices.length,
          filterMode: 'all',
          testIndices: indices,
          searchQuery: searchText,
          filters: filters as string[],
        });
      }),
    );

    returnTable = {
      head: {
        prompts: [
          ...table.head.prompts.map((prompt) => ({
            ...prompt,
            label: `[${id}] ${prompt.label || ''}`,
          })),
          ...comparisonTables.flatMap((table) =>
            table.head.prompts.map((prompt) => ({
              ...prompt,
              label: `[${table.id}] ${prompt.label || ''}`,
            })),
          ),
        ],
        vars: table.head.vars, // Assuming vars are the same
      },
      body: table.body.map((row) => {
        // Find matching row in comparison table by test index
        const testIdx = row.testIdx;
        const matchingRows = comparisonTables
          .map((table) => {
            const compRow = table.body.find((compRow) => {
              const compTestIdx = compRow.testIdx;
              return compTestIdx === testIdx;
            });
            return compRow;
          })
          .filter((r) => r !== undefined);

        return {
          ...row,
          outputs: [...row.outputs, ...(matchingRows.flatMap((r) => r?.outputs) || [])],
        };
      }),
    };
  }

  // Handle export formats
  if (format === 'csv') {
    const csvData = evalTableToCsv(returnTable, {
      isRedteam: Boolean(eval_.config.redteam),
    });

    setDownloadHeaders(res, `${id}.csv`, 'text/csv');
    res.send(csvData);
    return;
  } else if (format === 'json') {
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
        filters: filters as string[],
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
    const { id } = ApiSchemas.Eval.MetadataKeys.Params.parse(req.params);
    const { comparisonEvalIds = [] } = ApiSchemas.Eval.MetadataKeys.Query.parse(req.query);

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

    const response = ApiSchemas.Eval.MetadataKeys.Response.parse({ keys });
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
    const { id } = ApiSchemas.Eval.MetadataValues.Params.parse(req.params);
    const { key } = ApiSchemas.Eval.MetadataValues.Query.parse(req.query);

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    const values = EvalQueries.getMetadataValuesFromEval(id, key);
    const response = ApiSchemas.Eval.MetadataValues.Response.parse({ values });
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
  const id = req.params.id as string;
  const results = req.body as unknown as EvalResult[];

  if (!Array.isArray(results)) {
    res.status(400).json({ error: 'Results must be an array' });
    return;
  }
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
  const { evaluationId, testIndex, prompt, variables } = req.body;

  if (!evaluationId || !prompt) {
    res.status(400).json({ error: 'Missing required parameters' });
    return;
  }

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
      providerConfig = providers[testIndex % providers.length];
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
            vars: variables || {},
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
    let output = firstResult?.response?.output;

    // If still no output, try the raw response
    if (!output && firstResult?.response?.raw) {
      output = firstResult.response.raw;
    }

    // Return both output and any error information for debugging
    res.json({
      output: output || '',
      error: firstResult?.response?.error,
      response: firstResult?.response, // Include full response for debugging
    });
  } catch (error) {
    logger.error(`Failed to replay evaluation: ${error}`);
    res.status(500).json({ error: 'Failed to replay evaluation' });
  }
});

evalRouter.post(
  '/:evalId/results/:id/rating',
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const gradingResult = req.body as GradingResult;
    const result = await EvalResult.findById(id);
    invariant(result, 'Result not found');
    const eval_ = await Eval.findById(result.evalId);
    invariant(eval_, 'Eval not found');

    // Capture the current state before we change it
    const hasExistingManualOverride = Boolean(
      result.gradingResult?.componentResults?.some((r) => r.assertion?.type === 'human'),
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

evalRouter.post('/:evalId/assertions', async (req: Request, res: Response): Promise<void> => {
  const evalId = req.params.evalId as string;
  const parsed = PosthocAssertionsSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { assertions, scope } = parsed.data;

  if (scope.type === 'results' && (!scope.resultIds || scope.resultIds.length === 0)) {
    res.status(400).json({ success: false, error: 'resultIds are required for results scope' });
    return;
  }

  if (scope.type === 'tests' && (!scope.testIndices || scope.testIndices.length === 0)) {
    res.status(400).json({ success: false, error: 'testIndices are required for tests scope' });
    return;
  }

  const eval_ = await Eval.findById(evalId);
  if (!eval_) {
    res.status(404).json({ success: false, error: 'Eval not found' });
    return;
  }

  const normalizedAssertions: AssertionOrSet[] = [];
  const seenAssertionKeys = new Set<string>();
  for (const assertion of assertions) {
    const key = assertionKey(assertion as AssertionOrSet);
    if (!seenAssertionKeys.has(key)) {
      normalizedAssertions.push(assertion as AssertionOrSet);
      seenAssertionKeys.add(key);
    }
  }

  if (normalizedAssertions.length === 0) {
    res.json({
      success: true,
      data: {
        jobId: null,
        updatedResults: 0,
        skippedResults: 0,
        skippedAssertions: assertions.length,
        errors: [],
      },
    });
    return;
  }

  let targetResults: EvalResult[] = [];
  let matchedTestCount = 0;

  if (scope.type === 'results') {
    const results: EvalResult[] = [];
    for (const resultId of scope.resultIds || []) {
      const result = await EvalResult.findById(resultId);
      if (!result || result.evalId !== evalId) {
        res.status(404).json({ success: false, error: `Result not found: ${resultId}` });
        return;
      }
      results.push(result);
    }
    targetResults = results;
    matchedTestCount = results.length;
  } else if (scope.type === 'tests') {
    targetResults = await EvalResult.findManyByEvalIdAndTestIndices(
      evalId,
      scope.testIndices || [],
    );
    matchedTestCount = scope.testIndices?.length || 0;
  } else if (scope.type === 'filtered') {
    const filters =
      scope.filters?.map((filter) =>
        JSON.stringify({
          logicOperator: filter.logicOperator ?? 'and',
          type: filter.type,
          operator: filter.operator,
          value: filter.value,
          field: filter.field,
        }),
      ) || [];

    const { testIndices, filteredCount } = await eval_.getFilteredTestIndices({
      filterMode: scope.filterMode ?? 'all',
      searchQuery: scope.searchText ?? '',
      filters,
    });
    matchedTestCount = filteredCount;

    if (testIndices.length === 0) {
      res.json({
        success: true,
        data: {
          jobId: null,
          updatedResults: 0,
          skippedResults: 0,
          skippedAssertions: 0,
          errors: [],
          matchedTestCount,
        },
      });
      return;
    }

    targetResults = await EvalResult.findManyByEvalIdAndTestIndices(evalId, testIndices);
  }

  // Create job and return immediately
  const jobId = crypto.randomUUID();
  const job: AssertionJob = {
    evalId,
    status: 'in-progress',
    progress: 0,
    total: targetResults.length,
    completedResults: [],
    updatedResults: 0,
    skippedResults: 0,
    skippedAssertions: 0,
    errors: [],
    matchedTestCount,
  };
  assertionJobs.set(jobId, job);

  // Return job ID immediately
  res.json({
    success: true,
    data: {
      jobId,
      total: targetResults.length,
      matchedTestCount,
    },
  });

  // Process assertions in background
  const existingDefaultOptions =
    typeof eval_.config?.defaultTest === 'object' ? eval_.config.defaultTest?.options : undefined;

  const maxConcurrency = Math.max(
    1,
    eval_.runtimeOptions?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
  );

  // Run assertions asynchronously (intentionally not awaited)
  void (async () => {
    try {
      await async.forEachLimit(targetResults, maxConcurrency, async (result) => {
        if (result.failureReason === ResultFailureReason.ERROR) {
          job.skippedResults++;
          job.progress++;
          return;
        }

        const existingAssertions = result.testCase.assert || [];
        const existingKeys = new Set(existingAssertions.map(assertionKey));
        const assertionsToAdd = normalizedAssertions.filter(
          (assertion) => !existingKeys.has(assertionKey(assertion)),
        );

        job.skippedAssertions += normalizedAssertions.length - assertionsToAdd.length;

        if (assertionsToAdd.length === 0) {
          job.skippedResults++;
          job.progress++;
          return;
        }

        const testCaseForNewAssertions: AtomicTestCase = {
          ...result.testCase,
          options: {
            ...(existingDefaultOptions || {}),
            ...(result.testCase.options || {}),
          },
          assert: assertionsToAdd,
        };

        try {
          const providerResponse = result.response ?? { output: result.error ?? '' };
          const promptText = typeof result.prompt === 'string' ? result.prompt : result.prompt.raw;
          const newGradingResult = await runAssertions({
            prompt: promptText,
            providerResponse,
            test: testCaseForNewAssertions,
            latencyMs: result.latencyMs,
          });

          const newComponentResults = newGradingResult.componentResults || [];
          const existingComponentResults = result.gradingResult?.componentResults || [];
          const combinedComponentResults = [...existingComponentResults, ...newComponentResults];

          const aggregated = await recomputeAggregateGradingResult(
            combinedComponentResults,
            result.testCase,
          );

          result.gradingResult = {
            ...result.gradingResult,
            ...aggregated,
            componentResults: combinedComponentResults,
            comment: result.gradingResult?.comment,
          };

          result.namedScores = aggregated.namedScores || {};
          result.success = aggregated.pass;
          result.score = aggregated.score;

          result.failureReason = aggregated.pass
            ? ResultFailureReason.NONE
            : ResultFailureReason.ASSERT;

          result.testCase = {
            ...result.testCase,
            assert: [...existingAssertions, ...assertionsToAdd],
          };

          await result.save();
          job.updatedResults++;
          job.completedResults.push({
            resultId: result.id,
            pass: aggregated.pass,
            score: aggregated.score,
          });
        } catch (error) {
          job.errors.push({
            resultId: result.id,
            error: error instanceof Error ? error.message : String(error),
          });
          job.skippedResults++;
        }

        job.progress++;
      });

      if (job.updatedResults > 0) {
        await recalculatePromptMetrics(eval_);
      }

      job.status = 'complete';
    } catch (error) {
      job.status = 'error';
      logger.error(`[Assertion Job ${jobId}] Error: ${error}`);
    }
  })();
});

// Get assertion job status
evalRouter.get(
  '/:evalId/assertions/job/:jobId',
  async (req: Request, res: Response): Promise<void> => {
    const { jobId } = req.params;
    const job = assertionJobs.get(jobId);

    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        status: job.status,
        progress: job.progress,
        total: job.total,
        completedResults: job.completedResults,
        updatedResults: job.updatedResults,
        skippedResults: job.skippedResults,
        skippedAssertions: job.skippedAssertions,
        errors: job.errors,
        matchedTestCount: job.matchedTestCount,
      },
    });

    // Clean up completed jobs after fetching
    if (job.status === 'complete' || job.status === 'error') {
      // Keep jobs for 5 minutes after completion for polling
      setTimeout(
        () => {
          assertionJobs.delete(jobId);
        },
        5 * 60 * 1000,
      );
    }
  },
);

evalRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = req.body;
  try {
    if (body.data) {
      logger.debug('[POST /api/eval] Saving eval results (v3) to database');
      const { data: payload } = req.body as { data: ResultsFile };
      const id = await writeResultsToDatabase(payload.results as EvaluateSummaryV2, payload.config);
      res.json({ id });
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

      res.json({ id: eval_.id });
    }
  } catch (error) {
    logger.error(dedent`Failed to write eval to database:
      Error: ${error}
      Body: ${JSON.stringify(body, null, 2)}`);
    res.status(500).json({ error: 'Failed to write eval to database' });
  }
});

evalRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  try {
    await deleteEval(id);
    res.json({ message: 'Eval deleted successfully' });
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
  const ids = req.body.ids;
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'Ids must be an array' });
    return;
  }

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
    const { id } = ApiSchemas.Eval.Copy.Params.parse(req.params);
    const { description } = ApiSchemas.Eval.Copy.Request.parse(req.body);

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

    const response = ApiSchemas.Eval.Copy.Response.parse({
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
