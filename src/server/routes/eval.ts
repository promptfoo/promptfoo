import dedent from 'dedent';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import type {
  EvaluateSummaryV2,
  Job,
  ResultsFile,
} from '../../index';
import promptfoo from '../../index';
import logger from '../../logger';
import Eval from '../../models/eval';
import EvalResult from '../../models/evalResult';
import { updateResult, deleteEval, writeResultsToDatabase } from '../../util/database';
import invariant from '../../util/invariant';
import { ApiSchemas } from '../apiSchemas';

export const evalRouter = Router();

// Running jobs
export const evalJobs = new Map<string, Job>();

evalRouter.post('/job', (req: Request, res: Response): void => {
  const body = ApiSchemas.EvalJob.Create.Request.parse(req.body);
  const { evaluateOptions, ...testSuite } = body;
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
        prompts: testSuite.prompts || [],
        providers: testSuite.providers || [],
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

  res.json(ApiSchemas.EvalJob.Create.Response.parse({ id }));
});

evalRouter.get('/job/:id', (req: Request, res: Response): void => {
  const { id } = ApiSchemas.EvalJob.Get.Params.parse(req.params);
  const job = evalJobs.get(id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  let response;
  if (job.status === 'complete') {
    response = {
      status: 'complete' as const,
      result: job.result,
      evalId: job.evalId!,
    };
  } else if (job.status === 'error') {
    response = {
      status: 'error' as const,
      message: job.logs[0] || 'An error occurred during evaluation',
      logs: job.logs,
    };
  } else {
    response = {
      status: 'in-progress' as const,
      progress: job.progress,
      total: job.total,
      ...(job.logs.length > 0 && { message: job.logs[job.logs.length - 1] }),
    };
  }
  res.json(ApiSchemas.EvalJob.Get.Response.parse(response));
});

evalRouter.patch('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = ApiSchemas.Eval.Update.Params.parse(req.params);
    const { table, config } = ApiSchemas.Eval.Update.Request.parse(req.body);

    updateResult(id, config, table);
    res.json(ApiSchemas.Eval.Update.Response.parse({ message: 'Eval updated successfully' }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      res.status(500).json({ error: 'Failed to update eval table' });
    }
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
  try {
    const { id } = ApiSchemas.Eval.GetTable.Params.parse(req.params);
    const query = ApiSchemas.Eval.GetTable.Query.parse(req.query);
    const { limit = 50, offset = 0, filter = 'all', query: searchText = '', metadataFilter } = query;
    
    // Handle metric filter from metadata
    const metricFilter = metadataFilter?.metric || '';

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
    filterMode: filter as any,
    searchQuery: searchText,
    metricFilter,
  });

  const indices = table.body.map((row) => row.testIdx);

  let returnTable = { head: table.head, body: table.body };

  if (comparisonEvalIds.length > 0) {
    console.log('comparisonEvalIds', comparisonEvalIds);
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
          metricFilter,
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

    res.json(ApiSchemas.Eval.GetTable.Response.parse({
      table: returnTable,
      totalCount: table.totalCount,
      filteredCount: table.filteredCount,
      config: eval_.config,
      author: eval_.author || null,
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      logger.error(`Error fetching eval table: ${error}`);
      res.status(500).json({ error: 'Failed to fetch eval table' });
    }
  }
});

evalRouter.post('/:id/results', async (req: Request, res: Response) => {
  try {
    const { id } = ApiSchemas.Eval.AddResults.Params.parse(req.params);
    const results = ApiSchemas.Eval.AddResults.Request.parse(req.body);

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }
    
    await eval_.setResults(results);
    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      logger.error(`Failed to add results to eval: ${error}`);
      res.status(500).json({ error: 'Failed to add results to eval' });
    }
  }
});

evalRouter.post(
  '/:evalId/results/:id/rating',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = ApiSchemas.Eval.UpdateResultRating.Params.parse(req.params);
      const gradingResult = ApiSchemas.Eval.UpdateResultRating.Request.parse(req.body);
      
      const result = await EvalResult.findById(id);
      if (!result) {
        res.status(404).json({ error: 'Result not found' });
        return;
      }
      
      const eval_ = await Eval.findById(result.evalId);
      if (!eval_) {
        res.status(404).json({ error: 'Eval not found' });
        return;
      }

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

    res.json(ApiSchemas.Eval.UpdateResultRating.Response.parse(result));
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: fromZodError(error).toString() });
      } else {
        logger.error(`Failed to update result rating: ${error}`);
        res.status(500).json({ error: 'Failed to update result rating' });
      }
    }
  },
);

evalRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.body.data) {
      // Legacy v3 format
      logger.debug('[POST /api/eval] Saving eval results (v3) to database');
      const { data: payload } = req.body as { data: ResultsFile };
      const id = await writeResultsToDatabase(payload.results as EvaluateSummaryV2, payload.config);
      res.json(ApiSchemas.Eval.Create.Response.parse({ id }));
    } else {
      // v4 format
      const incEval = ApiSchemas.Eval.Create.Request.parse(req.body);
      logger.debug('[POST /api/eval] Saving eval results (v4) to database');
      const eval_ = await Eval.create(incEval.config, [], {
        author: incEval.author,
        createdAt: incEval.createdAt ? new Date(incEval.createdAt) : undefined,
        results: incEval.results,
      });
      logger.debug(`[POST /api/eval] Eval created with ID: ${eval_.id}`);

      logger.debug(`[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`);

      res.json(ApiSchemas.Eval.Create.Response.parse({ id: eval_.id }));
    }
  } catch (error) {
    logger.error(dedent`Failed to write eval to database:
      Error: ${error}
      Body: ${JSON.stringify(req.body, null, 2)}`);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      res.status(500).json({ error: 'Failed to write eval to database' });
    }
  }
});

evalRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = ApiSchemas.Eval.Delete.Params.parse(req.params);
    await deleteEval(id);
    res.json(ApiSchemas.Eval.Delete.Response.parse({ message: 'Eval deleted successfully' }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      res.status(500).json({ error: 'Failed to delete eval' });
    }
  }
});
