import { Router } from 'express';
import invariant from 'tiny-invariant';
import { v4 as uuidv4 } from 'uuid';
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

export const evalRouter = Router();

// Running jobs
const evalJobs = new Map<string, Job>();

evalRouter.post('/job', (req, res) => {
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

evalRouter.get('/job/:id', (req, res) => {
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

evalRouter.patch('/:id', (req, res) => {
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

evalRouter.post('/:evalId/results/:id/rating', async (req, res) => {
  const { id } = req.params;
  const gradingResult = req.body as GradingResult;
  const result = await EvalResult.findById(id);
  invariant(result, 'Result not found');
  result.gradingResult = gradingResult;
  result.success = gradingResult.pass;
  result.score = gradingResult.score;

  await result.save();
  res.json(result);
});

evalRouter.post('/', async (req, res) => {
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
      logger.debug(`[POST /api/eval] Eval created with ID: ${eval_.id}`);

      logger.debug(`[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`);

      res.json({ id: eval_.id });
    }
  } catch (error) {
    console.error('Failed to write eval to database', error, body);
    res.status(500).json({ error: 'Failed to write eval to database' });
  }
});

evalRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await deleteEval(id);
    res.json({ message: 'Eval deleted successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to delete eval' });
  }
});
