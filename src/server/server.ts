import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import { getDefaultPort, VERSION } from '../constants';
import { readSignalEvalId, setupSignalWatcher } from '../database/signal';
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
import { BrowserBehavior, BrowserBehaviorNames, openBrowser } from '../util/server';
import { blobsRouter } from './routes/blobs';
import { configsRouter } from './routes/configs';
import { evalRouter } from './routes/eval';
import { generationRouter } from './routes/generation';
import { mediaRouter } from './routes/media';
import { modelAuditRouter } from './routes/modelAudit';
import { providersRouter } from './routes/providers';
import { redteamRouter } from './routes/redteam';
import { tracesRouter } from './routes/traces';
import { userRouter } from './routes/user';
import versionRouter from './routes/version';
import type { Request, Response } from 'express';

import type { Prompt, PromptWithMetadata, TestCase, TestSuite } from '../index';
import type { EvalSummary } from '../types/index';

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

/**
 * Finds the static directory containing the web app.
 *
 * When running in development (tsx), getDirectory() returns src/ and the app is at src/app/.
 * When bundled into dist/src/server/index.js, getDirectory() returns dist/src/server/
 * but the app is at dist/src/app/, so we need to check the parent directory.
 */
export function findStaticDir(): string {
  const baseDir = getDirectory();

  // Try the standard location first (works in development)
  const standardPath = path.join(baseDir, 'app');
  if (fs.existsSync(path.join(standardPath, 'index.html'))) {
    return standardPath;
  }

  // When bundled, the server is at dist/src/server/ but app is at dist/src/app/
  const parentPath = path.resolve(baseDir, '..', 'app');
  if (fs.existsSync(path.join(parentPath, 'index.html'))) {
    logger.debug(`Static directory resolved to parent: ${parentPath}`);
    return parentPath;
  }

  // Fall back to standard path even if it doesn't exist (will fail gracefully later)
  logger.warn(`Static directory not found at ${standardPath} or ${parentPath}`);
  return standardPath;
}

export function createApp() {
  const app = express();

  const staticDir = findStaticDir();

  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
  app.use(express.urlencoded({ limit: REQUEST_SIZE_LIMIT, extended: true }));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'OK', version: VERSION });
  });

  app.get('/api/remote-health', async (_req: Request, res: Response): Promise<void> => {
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
      req: Request<
        {},
        {},
        {},
        { datasetId?: string; type?: 'redteam' | 'eval'; includeProviders?: boolean }
      >,
      res: Response<{ data: EvalSummary[] }>,
    ): Promise<void> => {
      const previousResults = await getEvalSummaries(
        req.query.datasetId,
        req.query.type,
        req.query.includeProviders,
      );
      res.json({ data: previousResults });
    },
  );

  app.get('/api/results/:id', async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const file = await readResult(id);
    if (!file) {
      res.status(404).send('Result not found');
      return;
    }
    res.json({ data: file.result });
  });

  app.get('/api/prompts', async (_req: Request, res: Response): Promise<void> => {
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
    const sha256hash = req.params.sha256hash as string;
    const prompts = await getPromptsForTestCasesHash(sha256hash);
    res.json({ data: prompts });
  });

  app.get('/api/datasets', async (_req: Request, res: Response): Promise<void> => {
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
      const url = await createShareableUrl(eval_, { showAuth: true });
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
  app.use('/api/generation', generationRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/blobs', blobsRouter);
  app.use('/api/providers', providersRouter);
  app.use('/api/redteam', redteamRouter);
  app.use('/api/user', userRouter);
  app.use('/api/configs', configsRouter);
  app.use('/api/model-audit', modelAuditRouter);
  app.use('/api/traces', tracesRouter);
  app.use('/api/version', versionRouter);

  app.post('/api/telemetry', async (req: Request, res: Response): Promise<void> => {
    try {
      const result = TelemetryEventSchema.safeParse(req.body);

      if (!result.success) {
        res
          .status(400)
          .json({ error: 'Invalid request body', details: z.prettifyError(result.error) });
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
  app.get('/*splat', (_req: Request, res: Response): void => {
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

  const watcher = setupSignalWatcher(() => {
    const handleSignalUpdate = async () => {
      // Try to get the specific eval that was updated from the signal file
      const signalEvalId = readSignalEvalId();
      const updatedEval = signalEvalId ? await Eval.findById(signalEvalId) : await Eval.latest();
      const results = await updatedEval?.getResultsCount();

      if (results && results > 0) {
        logger.debug(
          `Emitting update for eval: ${updatedEval?.config?.description || updatedEval?.id || 'unknown'}`,
        );
        io.emit('update', { evalId: updatedEval?.id });
        allPrompts = null;
      }
    };

    void handleSignalUpdate();
  });

  io.on('connection', async (socket) => {
    const latestEval = await Eval.latest();
    socket.emit('init', latestEval ? { evalId: latestEval.id } : null);
  });

  // Return a Promise that only resolves when the server shuts down
  // This keeps long-running commands (like `view`) running until SIGINT/SIGTERM
  return new Promise<void>((resolve) => {
    httpServer
      .listen(port, () => {
        const url = `http://localhost:${port}`;
        logger.info(`Server running at ${url} and monitoring for new evals.`);
        openBrowser(browserBehavior, port).catch((error) => {
          logger.error(
            `Failed to handle browser behavior (${BrowserBehaviorNames[browserBehavior]}): ${error instanceof Error ? error.message : error}`,
          );
        });
        // Don't resolve - server runs until shutdown signal
      })
      .on('error', (error: NodeJS.ErrnoException) => {
        // handleServerError calls process.exit(1), so this error handler
        // only provides logging before the process terminates
        handleServerError(error, port);
      });

    // Register shutdown handlers to gracefully close the server
    // Use once() to prevent handler accumulation if startServer is called multiple times
    const shutdown = () => {
      logger.info('Shutting down server...');

      // Close the file watcher first to stop monitoring
      watcher.close();

      // Set a timeout in case connections don't close gracefully
      const SHUTDOWN_TIMEOUT_MS = 5000;
      const forceCloseTimeout = setTimeout(() => {
        logger.warn('Server close timeout - forcing shutdown');
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);

      // Close Socket.io connections (this also closes the underlying HTTP server)
      io.close(() => {
        // Socket.io's close() already closes the HTTP server, so check if it's still listening
        // before attempting to close it again to avoid "Server is not running" errors
        if (!httpServer.listening) {
          clearTimeout(forceCloseTimeout);
          logger.info('Server closed');
          resolve();
          return;
        }

        httpServer.close((err) => {
          clearTimeout(forceCloseTimeout);
          if (err) {
            logger.warn(`Error closing server: ${err.message}`);
          }
          logger.info('Server closed');
          resolve();
        });
      });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
