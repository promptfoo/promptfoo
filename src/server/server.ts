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
import { getDbSignalPath } from '../database';
import { getDirectory } from '../esm';
import type {
  EvaluateTestSuiteWithEvaluateOptions,
  Job,
  Prompt,
  PromptWithMetadata,
  ResultsFile,
  TestCase,
  TestSuite,
} from '../index';
import promptfoo from '../index';
import logger from '../logger';
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

// Running jobs
const evalJobs = new Map<string, Job>();

// Prompts cache
let allPrompts: PromptWithMetadata[] | null = null;

export enum BrowserBehavior {
  ASK = 0,
  OPEN = 1,
  SKIP = 2,
}

export function startServer(
  port = 15500,
  browserBehavior = BrowserBehavior.ASK,
  filterDescription?: string,
) {
  const app = express();

  const staticDir = path.join(getDirectory(), 'app');

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

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
  });

  app.get('/api/results', (req, res) => {
    const datasetId = req.query.datasetId as string | undefined;
    const previousResults = listPreviousResults(
      undefined /* limit */,
      filterDescription,
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
    } catch {
      res.status(500).json({ error: 'Failed to update eval table' });
    }
  });

  app.post('/api/eval', async (req, res) => {
    const { data: payload } = req.body as { data: ResultsFile };

    try {
      const id = await writeResultsToDatabase(payload.results, payload.config);
      res.json({ id });
    } catch (error) {
      console.error('Failed to write eval to database', error);
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
    const { tagName, tagValue } = req.query;
    const tag =
      tagName && tagValue ? { key: tagName as string, value: tagValue as string } : undefined;
    const results = await getStandaloneEvals({ tag });
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

  // Handle client routing, return all requests to the app
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  httpServer
    .listen(port, () => {
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
