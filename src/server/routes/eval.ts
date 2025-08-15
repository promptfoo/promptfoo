import dedent from 'dedent';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import promptfoo from '../../index';
import logger from '../../logger';
import Eval from '../../models/eval';
import EvalResult from '../../models/evalResult';
import { deleteEval, updateResult, writeResultsToDatabase } from '../../util/database';
import invariant from '../../util/invariant';
import { ApiSchemas } from '../apiSchemas';
import type { Request, Response } from 'express';

import type {
  EvalTableDTO,
  EvaluateSummaryV2,
  EvaluateTestSuiteWithEvaluateOptions,
  GradingResult,
  Job,
  ResultsFile,
} from '../../index';

export const evalRouter = Router();

// Running jobs
export const evalJobs = new Map<string, Job>();

evalRouter.post('/job', (req: Request, res: Response): void => {
  const { evaluateOptions, ...testSuite } = req.body as EvaluateTestSuiteWithEvaluateOptions;
  const id = uuidv4();
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
  const id = req.params.id;
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

evalRouter.patch('/:id', (req: Request, res: Response): void => {
  const id = req.params.id;
  const { table, config } = req.body;

  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }

  try {
    updateResult(id, config, table);
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
      const validationError = fromZodError(error);
      res.status(400).json({ error: validationError.message });
    } else {
      logger.error(`Failed to update eval author: ${error}`);
      res.status(500).json({ error: 'Failed to update eval author' });
    }
  }
});

evalRouter.get('/:id/table', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;
  const filterMode = String(req.query.filterMode || 'all');
  const searchText = req.query.search ? String(req.query.search) : '';
  const filters = Array.isArray(req.query.filter)
    ? req.query.filter
    : typeof req.query.filter === 'string'
      ? [req.query.filter]
      : [];

  const comparisonEvalIds = Array.isArray(req.query.comparisonEvalIds)
    ? req.query.comparisonEvalIds
    : typeof req.query.comparisonEvalIds === 'string'
      ? [req.query.comparisonEvalIds]
      : [];

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
      body: table.body.map((row, index) => {
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

  res.json({
    table: returnTable,
    totalCount: table.totalCount,
    filteredCount: table.filteredCount,
    config: eval_.config,
    author: eval_.author || null,
    version: eval_.version(),
  } as EvalTableDTO);
});

evalRouter.post('/:id/results', async (req: Request, res: Response) => {
  const { id } = req.params;
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
    const { id } = req.params;
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
  const { id } = req.params;
  try {
    await deleteEval(id);
    res.json({ message: 'Eval deleted successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to delete eval' });
  }
});
