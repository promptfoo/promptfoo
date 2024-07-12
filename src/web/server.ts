import compression from 'compression';
import cors from 'cors';
import debounce from 'debounce';
import express from 'express';
import fs, { Stats } from 'fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';
import opener from 'opener';
import { Server as SocketIOServer } from 'socket.io';
import invariant from 'tiny-invariant';
import { v4 as uuidv4 } from 'uuid';
import { getDbSignalPath } from '../database';
import { getDirectory } from '../esm';
import promptfoo, {
  EvaluateTestSuiteWithEvaluateOptions,
  Job,
  Prompt,
  PromptWithMetadata,
  TestCase,
  TestSuite,
} from '../index';
import logger from '../logger';
import { synthesizeFromTestSuite } from '../testCases';
import {
  getPrompts,
  getPromptsForTestCasesHash,
  listPreviousResults,
  readResult,
  getTestCases,
  updateResult,
  readLatestResults,
  migrateResultsFromFileSystemToDatabase,
  getStandaloneEvals,
  deleteEval,
} from '../util';

// Running jobs
const evalJobs = new Map<string, Job>();

// Prompts cache
let allPrompts: PromptWithMetadata[] | null = null;

export enum BrowserBehavior {
  ASK = 0,
  OPEN = 1,
  SKIP = 2,
}

export async function startServer(
  port = 15500,
  apiBaseUrl = '',
  browserBehavior = BrowserBehavior.ASK,
  filterDescription?: string,
) {
  const app = express();

  const staticDir = path.join(getDirectory(), 'web', 'nextui');

  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  await migrateResultsFromFileSystemToDatabase();

  const watchFilePath = getDbSignalPath();
  const watcher = debounce(async (curr: Stats, prev: Stats) => {
    if (curr.mtime !== prev.mtime) {
      io.emit('update', await readLatestResults(filterDescription));
      allPrompts = null;
    }
  }, 250);
  fs.watchFile(watchFilePath, watcher);

  io.on('connection', async (socket) => {
    socket.emit('init', await readLatestResults(filterDescription));
  });

  app.get('/api/results', (req, res) => {
    const previousResults = listPreviousResults(undefined /* limit */, filterDescription);
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
      .then((result) => {
        const job = evalJobs.get(id);
        invariant(job, 'Job not found');
        job.status = 'complete';
        job.result = result;
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
    } catch (error) {
      res.status(500).json({ error: 'Failed to update eval table' });
    }
  });

  app.delete('/api/eval/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await deleteEval(id);
      res.json({ message: 'Eval deleted successfully' });
    } catch (error) {
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
    const results = await getStandaloneEvals();
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

  app.get('/api/config', (req, res) => {
    res.json({
      apiBaseUrl: apiBaseUrl || '',
    });
  });

  app.post('/api/dataset/generate', async (req, res) => {
    const testSuite: TestSuite = {
      prompts: req.body.prompts as Prompt[],
      tests: req.body.tests as TestCase[],
      providers: [],
    };

    const results = await synthesizeFromTestSuite(testSuite, {});
    return {
      results,
    };
  });

  // Must come after the above routes (particularly /api/config) so it doesn't
  // overwrite dynamic routes.
  app.use(express.static(staticDir));

  httpServer.listen(port, () => {
    const url = `http://localhost:${port}`;
    logger.info(`Server running at ${url} and monitoring for new evals.`);

    const openUrl = async () => {
      try {
        logger.info('Press Ctrl+C to stop the server');
        await opener(url);
      } catch (err) {
        logger.error(`Failed to open browser: ${String(err)}`);
      }
    };

    if (browserBehavior === BrowserBehavior.OPEN) {
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
  });
}
