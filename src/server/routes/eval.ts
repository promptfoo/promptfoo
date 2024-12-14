import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import type {
  EvaluateSummaryV2,
  EvaluateTestSuiteWithEvaluateOptions,
  GradingResult,
  Job,
  ResultsFile,
} from '../../index';
import promptfoo from '../../index';
import logger from '../../logger';
import Eval from '../../models/eval';
import EvalResult from '../../models/evalResult';
import { updateResult, deleteEval, writeResultsToDatabase } from '../../util';
import invariant from '../../util/invariant';
import { ApiSchemas } from '../apiSchemas';

export const evalRouter = Router();

// Running jobs
const evalJobs = new Map<string, Job>();

evalRouter.post('/job', (req: Request, res: Response): void => {
  const { evaluateOptions, ...testSuite } = req.body as EvaluateTestSuiteWithEvaluateOptions;
  const id = uuidv4();
  evalJobs.set(id, { status: 'in-progress', progress: 0, total: 0, result: null });

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
      console.log(`[${id}] Complete`);
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
    res.json({ status: 'complete', result: job.result });
  } else {
    res.json({ status: 'in-progress', progress: job.progress, total: job.total });
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
      console.error('Failed to update eval author:', error);
      res.status(500).json({ error: 'Failed to update eval author' });
    }
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
      });
      if (incEval.prompts) {
        eval_.addPrompts(incEval.prompts);
      }
      logger.debug(`[POST /api/eval] Eval created with ID: ${eval_.id}`);

      logger.debug(`[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`);

      res.json({ id: eval_.id });
    }
  } catch (error) {
    console.error('Failed to write eval to database', error, body);
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
