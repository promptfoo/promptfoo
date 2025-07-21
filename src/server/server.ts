import compression from 'compression';
import cors from 'cors';
import 'dotenv/config';

import http from 'node:http';
import path from 'node:path';

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { fromError } from 'zod-validation-error';
import { getDefaultPort, VERSION } from '../constants';
import { setupSignalWatcher } from '../database/signal';
import { getDirectory } from '../esm';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { runDbMigrations } from '../migrate';
import Eval, { getEvalSummaries } from '../models/eval';
import { getRemoteHealthUrl } from '../redteam/remoteGeneration';
import { createShareableUrl, determineShareDomain, stripAuthFromUrl } from '../share';
import telemetry, { TelemetryEventSchema } from '../telemetry';
import { synthesizeFromTestSuite } from '../testCase/synthesis';
import { checkRemoteHealth } from '../util/apiHealth';
import {
  getPrompts,
  getPromptsForTestCasesHash,
  getStandaloneEvals,
  getTestCases,
  readResult,
} from '../util/database';
import invariant from '../util/invariant';
import { BrowserBehavior, openBrowser } from '../util/server';
import { configsRouter } from './routes/configs';
import { evalRouter } from './routes/eval';
import { modelAuditRouter } from './routes/modelAudit';
import { providersRouter } from './routes/providers';
import { redteamRouter } from './routes/redteam';
import { tracesRouter } from './routes/traces';
import { userRouter } from './routes/user';
import type { Request, Response } from 'express';

import type { Prompt, PromptWithMetadata, TestCase, TestSuite } from '../index';
import type { EvalSummary } from '../types';

// Prompts cache
let allPrompts: PromptWithMetadata[] | null = null;

// JavaScript file extensions that need proper MIME type
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// Express middleware limits
const REQUEST_SIZE_LIMIT = '100mb';

/**
 * Middleware to set proper MIME types for JavaScript files.
 * This is necessary because some browsers (especially Arc) enforce strict MIME type checking
 * and will refuse to execute scripts with incorrect MIME types for security reasons.
 */
export function setJavaScriptMimeType(
  req: Request,
  res: Response,
  next: express.NextFunction,
): void {
  const ext = path.extname(req.path);
  if (JS_EXTENSIONS.has(ext)) {
    res.setHeader('Content-Type', 'application/javascript');
  }
  next();
}

/**
 * Handles server startup errors with proper logging and graceful shutdown.
 */
export function handleServerError(error: NodeJS.ErrnoException, port: number): void {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use. Do you have another Promptfoo instance running?`);
  } else {
    logger.error(`Failed to start server: ${error instanceof Error ? error.message : error}`);
  }
  process.exit(1);
}

export function createApp() {
  const app = express();

  const staticDir = path.join(getDirectory(), 'app');

  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
  app.use(express.urlencoded({ limit: REQUEST_SIZE_LIMIT, extended: true }));
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', version: VERSION });
  });

  app.get('/api/remote-health', async (req: Request, res: Response): Promise<void> => {
    const apiUrl = getRemoteHealthUrl();

    if (apiUrl === null) {
      res.json({
        status: 'DISABLED',
        message: 'remote generation and grading are disabled',
      });
      return;
    }

    const result = await checkRemoteHealth(apiUrl);
    res.json(result);
  });

  /**
   * Fetches summaries of all evals, optionally for a given dataset.
   */
  app.get(
    '/api/results',
    async (
      req: Request<{}, {}, {}, { datasetId?: string }>,
      res: Response<{ data: EvalSummary[] }>,
    ): Promise<void> => {
      const previousResults = await getEvalSummaries(req.query.datasetId);
      res.json({ data: previousResults });
    },
  );

  app.get('/api/results/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const file = await readResult(id);
    if (!file) {
      res.status(404).send('Result not found');
      return;
    }
    res.json({ data: file.result });
  });

  app.get('/api/prompts', async (req: Request, res: Response): Promise<void> => {
    if (allPrompts == null) {
      allPrompts = await getPrompts();
    }
    res.json({ data: allPrompts });
  });

  app.get('/api/history', async (req: Request, res: Response): Promise<void> => {
    const tagName = req.query.tagName as string | undefined;
    const tagValue = req.query.tagValue as string | undefined;
    const description = req.query.description as string | undefined;
    const tag = tagName && tagValue ? { key: tagName, value: tagValue } : undefined;
    const results = await getStandaloneEvals({
      tag,
      description,
    });
    res.json({
      data: results,
    });
  });

  app.get('/api/prompts/:sha256hash', async (req: Request, res: Response): Promise<void> => {
    const sha256hash = req.params.sha256hash;
    const prompts = await getPromptsForTestCasesHash(sha256hash);
    res.json({ data: prompts });
  });

  app.get('/api/datasets', async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await getTestCases() });
  });

  app.get('/api/results/share/check-domain', async (req: Request, res: Response): Promise<void> => {
    const id = req.query.id as string | undefined;
    if (!id || id === 'undefined') {
      logger.warn(`Missing or invalid id parameter in ${req.method} ${req.path}`);
      res.status(400).json({ error: 'Missing id parameter' });
      return;
    }

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      logger.warn(`Eval not found for id: ${id}`);
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    const { domain } = determineShareDomain(eval_);
    const isCloudEnabled = cloudConfig.isEnabled();
    res.json({ domain, isCloudEnabled });
  });

  app.post('/api/results/share', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.body;
    logger.debug(`[${req.method} ${req.path}] Share request for eval ID: ${id || 'undefined'}`);

    const result = await readResult(id);
    if (!result) {
      logger.warn(`Result not found for id: ${id}`);
      res.status(404).json({ error: 'Eval not found' });
      return;
    }
    const eval_ = await Eval.findById(id);
    invariant(eval_, 'Eval not found');

    try {
      const url = await createShareableUrl(eval_, true);
      logger.debug(`Generated share URL for eval ${id}: ${stripAuthFromUrl(url || '')}`);
      res.json({ url });
    } catch (error) {
      logger.error(
        `Failed to generate share URL for eval ${id}: ${error instanceof Error ? error.message : error}`,
      );
      res.status(500).json({ error: 'Failed to generate share URL' });
    }
  });

  app.post('/api/dataset/generate', async (req: Request, res: Response): Promise<void> => {
    const testSuite: TestSuite = {
      prompts: req.body.prompts as Prompt[],
      tests: req.body.tests as TestCase[],
      providers: [],
    };
    const results = await synthesizeFromTestSuite(testSuite, {});
    res.json({ results });
  });

  app.use('/api/eval', evalRouter);
  app.use('/api/providers', providersRouter);
  app.use('/api/redteam', redteamRouter);
  app.use('/api/user', userRouter);
  app.use('/api/configs', configsRouter);
  app.use('/api/model-audit', modelAuditRouter);
  app.use('/api/traces', tracesRouter);

  app.post('/api/telemetry', async (req: Request, res: Response): Promise<void> => {
    try {
      const result = TelemetryEventSchema.safeParse(req.body);

      if (!result.success) {
        res
          .status(400)
          .json({ error: 'Invalid request body', details: fromError(result.error).toString() });
        return;
      }
      const { event, properties } = result.data;
      await telemetry.record(event, properties);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(
        `Error processing telemetry request: ${error instanceof Error ? error.message : error}`,
      );
      res.status(500).json({ error: 'Failed to process telemetry request' });
    }
  });

  // Must come after the above routes (particularly /api/config) so it doesn't
  // overwrite dynamic routes.

  // Configure proper MIME types for JavaScript files
  app.use(setJavaScriptMimeType);

  app.use(express.static(staticDir, { dotfiles: 'allow' }));

  // Handle client routing, return all requests to the app
  app.get('/*splat', (req: Request, res: Response): void => {
    res.sendFile('index.html', { root: staticDir, dotfiles: 'allow' });
  });
  return app;
}

export async function startServer(
  port = getDefaultPort(),
  browserBehavior: BrowserBehavior = BrowserBehavior.ASK,
) {
  const app = createApp();

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  await runDbMigrations();

  setupSignalWatcher(async () => {
    const latestEval = await Eval.latest();
    const results = await latestEval?.getResultsCount();

    if (results && results > 0) {
      logger.info(
        `Emitting update for eval: ${latestEval?.config?.description || latestEval?.id || 'unknown'}`,
      );
      io.emit('update', latestEval);
      allPrompts = null;
    }
  });

  io.on('connection', async (socket) => {
    socket.emit('init', await Eval.latest());
  });

  httpServer
    .listen(port, () => {
      const url = `http://localhost:${port}`;
      logger.info(`Server running at ${url} and monitoring for new evals.`);
      openBrowser(browserBehavior, port).catch((error) => {
        logger.error(
          `Failed to handle browser behavior (${BrowserBehavior[browserBehavior]}): ${error instanceof Error ? error.message : error}`,
        );
      });
    })
    .on('error', (error: NodeJS.ErrnoException) => {
      handleServerError(error, port);
    });
}
