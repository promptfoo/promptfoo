import compression from 'compression';
import cors from 'cors';
import debounce from 'debounce';
import express from 'express';
import type { Stats } from 'fs';
import fs from 'fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';
import opener from 'opener';
import { Server as SocketIOServer } from 'socket.io';
import invariant from 'tiny-invariant';
import { v4 as uuidv4 } from 'uuid';
import { createPublicUrl } from '../commands/share';
import { VERSION } from '../constants';
import { getDbSignalPath } from '../database';
import { getDirectory } from '../esm';
import type {
  EvaluateSummaryV2,
  EvaluateTestSuiteWithEvaluateOptions,
  GradingResult,
  Job,
  Prompt,
  PromptWithMetadata,
  ResultsFile,
  TestCase,
  TestSuite,
} from '../index';
import promptfoo from '../index';
import logger from '../logger';
import Eval from '../models/eval';
import EvalResult from '../models/evalResult';
import { synthesizeFromTestSuite } from '../testCases';
import {
  getPrompts,
  getPromptsForTestCasesHash,
  listPreviousResults,
  readResult,
  getTestCases,
  updateResult,
  getLatestEval,
  migrateResultsFromFileSystemToDatabase,
  getStandaloneEvals,
  deleteEval,
  writeResultsToDatabase,
} from '../util';
import { providersRouter } from './routes/providers';

// Running jobs
const evalJobs = new Map<string, Job>();

// Prompts cache
let allPrompts: PromptWithMetadata[] | null = null;

export enum BrowserBehavior {
  ASK = 0,
  OPEN = 1,
  SKIP = 2,
  OPEN_TO_REPORT = 3,
}

export function createApp() {
  const app = express();

  const staticDir = path.join(getDirectory(), 'app');

  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', version: VERSION });
  });

  app.get('/api/results', async (req, res) => {
    const datasetId = req.query.datasetId as string | undefined;
    const previousResults = await listPreviousResults(
      undefined /* limit */,
      undefined /* offset */,
      datasetId,
    );
    res.json({
      data: previousResults.map((meta) => {
        return {
          ...meta,
          label: meta.description ? `${meta.description} (${meta.evalId})` : meta.evalId,
        };
      }),
    });
  });

  app.post('/api/eval/job', (req, res) => {
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

  app.get('/api/eval/job/:id', (req, res) => {
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

  app.patch('/api/eval/:id', (req, res) => {
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

  app.post('/api/eval/:evalId/results/:id/rating', async (req, res) => {
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

  app.post('/api/eval', async (req, res) => {
    const body = req.body;
    try {
      if (body.data) {
        logger.debug('[POST /api/eval] Saving eval results (v3) to database');
        const { data: payload } = req.body as { data: ResultsFile };
        const id = await writeResultsToDatabase(
          payload.results as EvaluateSummaryV2,
          payload.config,
        );
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

        logger.debug(
          `[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`,
        );

        res.json({ id: eval_.id });
      }
    } catch (error) {
      console.error('Failed to write eval to database', error, body);
      res.status(500).json({ error: 'Failed to write eval to database' });
    }
  });

  app.delete('/api/eval/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await deleteEval(id);
      res.json({ message: 'Eval deleted successfully' });
    } catch {
      res.status(500).json({ error: 'Failed to delete eval' });
    }
  });

  app.get('/api/results/:id', async (req, res) => {
    const { id } = req.params;
    const file = await readResult(id);
    if (!file) {
      res.status(404).send('Result not found');
      return;
    }
    res.json({ data: file.result });
  });

  app.get('/api/prompts', async (req, res) => {
    if (allPrompts == null) {
      allPrompts = await getPrompts();
    }
    res.json({ data: allPrompts });
  });

  app.get('/api/progress', async (req, res) => {
    const { tagName, tagValue, description } = req.query;
    const tag =
      tagName && tagValue ? { key: tagName as string, value: tagValue as string } : undefined;
    const results = await getStandaloneEvals({
      tag,
      description: description as string | undefined,
    });
    res.json({
      data: results,
    });
  });

  app.get('/api/prompts/:sha256hash', async (req, res) => {
    const sha256hash = req.params.sha256hash;
    const prompts = await getPromptsForTestCasesHash(sha256hash);
    res.json({ data: prompts });
  });

  app.get('/api/datasets', async (req, res) => {
    res.json({ data: await getTestCases() });
  });

  // This is used by ResultsView.tsx to share an eval with another promptfoo instance
  app.post('/api/results/share', async (req, res) => {
    const { id } = req.body;

    const result = await readResult(id);
    if (!result) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }
    const eval_ = await Eval.findById(id);
    invariant(eval_, 'Eval not found');
    const url = await createPublicUrl(eval_, true);
    res.json({ url });
  });

  app.post('/api/dataset/generate', async (req, res) => {
    const testSuite: TestSuite = {
      prompts: req.body.prompts as Prompt[],
      tests: req.body.tests as TestCase[],
      providers: [],
    };
    const results = await synthesizeFromTestSuite(testSuite, {});
    res.json({ results });
  });

  app.post('/api/redteam/:task', async (req, res) => {
    const { task } = req.params;
    const CLOUD_FUNCTION_URL =
      process.env.PROMPTFOO_REMOTE_GENERATION_URL || 'https://api.promptfoo.dev/v1/generate';

    logger.debug(`Received ${task} task request:`, {
      method: req.method,
      url: req.url,
      body: req.body,
      // headers: req.headers,
    });

    try {
      logger.debug(`Sending request to cloud function: ${CLOUD_FUNCTION_URL}`);
      const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task,
          ...req.body,
        }),
      });

      if (!response.ok) {
        logger.error(`Cloud function responded with status ${response.status}`);
        throw new Error(`Cloud function responded with status ${response.status}`);
      }

      const data = await response.json();
      logger.debug(`Received response from cloud function:`, data);
      res.json(data);
    } catch (error) {
      logger.error(`Error in ${task} task:`, error);
      res.status(500).json({ error: `Failed to process ${task} task` });
    }
  });

  app.use('/api/providers', providersRouter);

  // Must come after the above routes (particularly /api/config) so it doesn't
  // overwrite dynamic routes.
  app.use(express.static(staticDir));

  // Handle client routing, return all requests to the app
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
  return app;
}

export function startServer(
  port = 15500,
  browserBehavior = BrowserBehavior.ASK,
  filterDescription?: string,
) {
  const app = createApp();

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  migrateResultsFromFileSystemToDatabase().then(() => {
    logger.info('Migrated results from file system to database');
  });

  const watchFilePath = getDbSignalPath();
  const watcher = debounce(async (curr: Stats, prev: Stats) => {
    if (curr.mtime !== prev.mtime) {
      io.emit('update', await getLatestEval(filterDescription));
      allPrompts = null;
    }
  }, 250);
  fs.watchFile(watchFilePath, watcher);

  io.on('connection', async (socket) => {
    socket.emit('init', await getLatestEval(filterDescription));
  });

  httpServer
    .listen(port, () => {
      const url = `http://localhost:${port}`;
      logger.info(`Server running at ${url} and monitoring for new evals.`);

      const openUrl = async () => {
        try {
          logger.info('Press Ctrl+C to stop the server');
          if (browserBehavior === BrowserBehavior.OPEN_TO_REPORT) {
            await opener(`${url}/report`);
          } else {
            await opener(url);
          }
        } catch (err) {
          logger.error(`Failed to open browser: ${String(err)}`);
        }
      };

      if (
        browserBehavior === BrowserBehavior.OPEN ||
        browserBehavior === BrowserBehavior.OPEN_TO_REPORT
      ) {
        openUrl();
      } else if (browserBehavior === BrowserBehavior.ASK) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question('Open URL in browser? (y/N): ', async (answer) => {
          if (answer.toLowerCase().startsWith('y')) {
            openUrl();
          }
          rl.close();
        });
      }
    })
    .on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(
          `Unable to start server on port ${port}. It's currently in use. Check for existing promptfoo instances.`,
        );
        process.exit(1);
      } else {
        logger.error(`Failed to start server: ${error.message}`);
        process.exit(1);
      }
    });
}
