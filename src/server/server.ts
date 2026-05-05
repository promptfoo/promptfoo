import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { getDefaultPort, VERSION } from '../constants';
import { readSignalEvalId, setupSignalWatcher } from '../database/signal';
import { getDirectory } from '../esm';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { runDbMigrations } from '../migrate';
import Eval, { getEvalSummaries } from '../models/eval';
import { getRemoteHealthUrl } from '../redteam/remoteGeneration';
import { createShareableUrl, determineShareDomain, stripAuthFromUrl } from '../share';
import telemetry from '../telemetry';
import { synthesizeFromTestSuite } from '../testCase/synthesis';
import { ServerSchemas } from '../types/api/server';
import { checkRemoteHealth } from '../util/apiHealth';
import {
  getPrompts,
  getPromptsForTestCasesHash,
  getStandaloneEvals,
  getTestCases,
  readResult,
} from '../util/database';
import { BrowserBehavior, BrowserBehaviorNames, openBrowser } from '../util/server';
import { csrfProtection } from './middleware/csrfProtection';
import { blobsRouter } from './routes/blobs';
import { configsRouter } from './routes/configs';
import { evalRouter } from './routes/eval';
import { mediaRouter } from './routes/media';
import { modelAuditRouter } from './routes/modelAudit';
import { providersRouter } from './routes/providers';
import { redteamRouter } from './routes/redteam';
import { tracesRouter } from './routes/traces';
import { userRouter } from './routes/user';
import versionRouter from './routes/version';
import { replyValidationError, sendError } from './utils/errors';
import type { Request, Response } from 'express';

import type { Prompt, PromptWithMetadata, TestCase, TestSuite } from '../index';

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

import { ServerError, type ServerErrorPhase } from './errors';

export function handleServerError(
  error: NodeJS.ErrnoException,
  port: number,
  phase: ServerErrorPhase = 'startup',
): ServerError {
  const serverError = new ServerError(error, port, phase);
  logger.error(serverError.message);
  return serverError;
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
  app.use(csrfProtection);
  app.use(compression());
  app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
  app.use(express.urlencoded({ limit: REQUEST_SIZE_LIMIT, extended: true }));
  app.get('/health', (_req, res) => {
    // Health probes must never 500 from a self-imposed schema check.
    res.status(200).json({ status: 'OK', version: VERSION });
  });

  app.get('/api/remote-health', async (_req: Request, res: Response): Promise<void> => {
    const apiUrl = getRemoteHealthUrl();

    if (apiUrl === null) {
      res.json(
        ServerSchemas.RemoteHealth.Response.parse({
          status: 'DISABLED',
          message: 'remote generation and grading are disabled',
        }),
      );
      return;
    }

    const result = await checkRemoteHealth(apiUrl);
    res.json(ServerSchemas.RemoteHealth.Response.parse(result));
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
      res: Response,
    ): Promise<void> => {
      const queryResult = ServerSchemas.ResultList.Query.safeParse(req.query);
      if (!queryResult.success) {
        replyValidationError(res, queryResult.error);
        return;
      }
      const previousResults = await getEvalSummaries(
        queryResult.data.datasetId,
        queryResult.data.type,
        queryResult.data.includeProviders,
      );
      res.json(ServerSchemas.ResultList.Response.parse({ data: previousResults }));
    },
  );

  app.get('/api/results/:id', async (req: Request, res: Response): Promise<void> => {
    const paramsResult = ServerSchemas.Result.Params.safeParse(req.params);
    if (!paramsResult.success) {
      replyValidationError(res, paramsResult.error);
      return;
    }
    const { id } = paramsResult.data;
    const file = await readResult(id);
    if (!file) {
      res.status(404).json({ error: 'Result not found' });
      return;
    }
    res.json(ServerSchemas.Result.Response.parse({ data: file.result }));
  });

  app.get('/api/prompts', async (_req: Request, res: Response): Promise<void> => {
    if (allPrompts == null) {
      allPrompts = await getPrompts();
    }
    res.json(ServerSchemas.Prompts.Response.parse({ data: allPrompts }));
  });

  app.get('/api/history', async (req: Request, res: Response): Promise<void> => {
    const queryResult = ServerSchemas.History.Query.safeParse(req.query);
    if (!queryResult.success) {
      replyValidationError(res, queryResult.error);
      return;
    }
    const { tagName, tagValue, description } = queryResult.data;
    const tag = tagName && tagValue ? { key: tagName, value: tagValue } : undefined;
    const results = await getStandaloneEvals({
      tag,
      description,
    });
    res.json(ServerSchemas.History.Response.parse({ data: results }));
  });

  app.get('/api/prompts/:sha256hash', async (req: Request, res: Response): Promise<void> => {
    const paramsResult = ServerSchemas.Prompt.Params.safeParse(req.params);
    if (!paramsResult.success) {
      replyValidationError(res, paramsResult.error);
      return;
    }
    const { sha256hash } = paramsResult.data;
    const prompts = await getPromptsForTestCasesHash(sha256hash);
    res.json(ServerSchemas.Prompt.Response.parse({ data: prompts }));
  });

  app.get('/api/datasets', async (_req: Request, res: Response): Promise<void> => {
    res.json(ServerSchemas.Datasets.Response.parse({ data: await getTestCases() }));
  });

  app.get('/api/results/share/check-domain', async (req: Request, res: Response): Promise<void> => {
    const queryResult = ServerSchemas.ShareCheckDomain.Query.safeParse(req.query);
    if (!queryResult.success) {
      logger.warn('Missing or invalid id parameter on share check-domain', {
        method: req.method,
        path: req.path,
      });
      replyValidationError(res, queryResult.error);
      return;
    }
    const { id } = queryResult.data;

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      logger.warn('Eval not found for share check-domain', { id });
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    const { domain } = determineShareDomain(eval_);
    const isCloudEnabled = cloudConfig.isEnabled();
    res.json(ServerSchemas.ShareCheckDomain.Response.parse({ domain, isCloudEnabled }));
  });

  // Share URL creation is intentionally unthrottled for local-server workflows. UI and CLI
  // actions can legitimately burst through this route, and a per-IP limiter would block the
  // operator without changing the local trust boundary. See src/server/AGENTS.md for the
  // codified policy; CodeQL js/missing-rate-limiting is an accepted exception here.
  app.post('/api/results/share', async (req: Request, res: Response): Promise<void> => {
    const bodyResult = ServerSchemas.Share.Request.safeParse(req.body);
    if (!bodyResult.success) {
      replyValidationError(res, bodyResult.error);
      return;
    }
    const { id } = bodyResult.data;
    logger.debug('Share request for eval ID', { id, method: req.method, path: req.path });

    // `Eval.findById` returns `undefined` only for a missing row and otherwise
    // throws on real DB errors (lock contention, schema drift, etc.). Branch
    // on the throw to distinguish 500 from 404 — `readResult` cannot serve
    // that role because it catches its own exceptions and also returns
    // `undefined` (`src/util/database.ts`), which would silently classify
    // every load failure as "not found". A separate preflight via
    // `readResult` would also double the per-request DB load.
    let eval_: Awaited<ReturnType<typeof Eval.findById>>;
    try {
      eval_ = await Eval.findById(id);
    } catch (error) {
      sendError(res, 500, 'Failed to load eval for share', error);
      return;
    }
    if (!eval_) {
      logger.warn('Eval not found for share request', { id });
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    try {
      const url = await createShareableUrl(eval_, { showAuth: true });
      logger.debug('Generated share URL for eval', { id, url: stripAuthFromUrl(url || '') });
      res.json(ServerSchemas.Share.Response.parse({ url }));
    } catch (error) {
      sendError(res, 500, 'Failed to generate share URL', error);
    }
  });

  app.post('/api/dataset/generate', async (req: Request, res: Response): Promise<void> => {
    const bodyResult = ServerSchemas.DatasetGenerate.Request.safeParse(req.body);
    if (!bodyResult.success) {
      replyValidationError(res, bodyResult.error);
      return;
    }
    const prompts = bodyResult.data.prompts.map((prompt): Prompt => {
      if (typeof prompt === 'string') {
        return { raw: prompt, label: prompt };
      }
      return { ...prompt, label: prompt.label ?? prompt.raw };
    });
    const testSuite: TestSuite = {
      prompts,
      tests: bodyResult.data.tests as TestCase[],
      providers: [],
    };
    const results = await synthesizeFromTestSuite(testSuite, {});
    res.json(ServerSchemas.DatasetGenerate.Response.parse({ results }));
  });

  app.use('/api/eval', evalRouter);
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
    const result = ServerSchemas.Telemetry.Request.safeParse(req.body);

    if (!result.success) {
      replyValidationError(res, result.error);
      return;
    }

    try {
      const { event, properties } = result.data;
      await telemetry.record(event, properties);
      res.status(200).json(ServerSchemas.Telemetry.Response.parse({ success: true }));
    } catch (error) {
      sendError(res, 500, 'Failed to process telemetry request', error);
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
  return new Promise<void>((resolve, reject) => {
    const removeShutdownHandlers = () => {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
    };

    const safeCloseWatcher = () => {
      try {
        watcher.close();
      } catch (err) {
        // watcher.close() can throw on double-close or partially-failed FSWatchers.
        // Surface it but never let it deadlock the lifecycle promise.
        logger.warn(`Error closing file watcher: ${err instanceof Error ? err.message : err}`);
      }
    };

    const closeRunningServer = (onClose: (timedOut: boolean) => void) => {
      safeCloseWatcher();

      // Set a timeout in case connections don't close gracefully
      const SHUTDOWN_TIMEOUT_MS = 5000;
      let settled = false;
      const settle = (timedOut: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(forceCloseTimeout);
        onClose(timedOut);
      };
      const forceCloseTimeout = setTimeout(() => {
        logger.warn('Server close timeout - forcing shutdown');
        settle(true);
      }, SHUTDOWN_TIMEOUT_MS);

      // Close Socket.io connections (this also closes the underlying HTTP server)
      io.close(() => {
        // Socket.io's close() already closes the HTTP server, so check if it's still listening
        // before attempting to close it again to avoid "Server is not running" errors
        if (!httpServer.listening) {
          logger.info('Server closed');
          settle(false);
          return;
        }

        httpServer.close((err) => {
          if (err) {
            logger.warn(`Error closing server: ${err.message}`);
          }
          logger.info('Server closed');
          settle(false);
        });
      });
    };

    // Register shutdown handlers to gracefully close the server
    // Use once() to prevent handler accumulation if startServer is called multiple times
    const shutdown = () => {
      logger.info('Shutting down server...');
      removeShutdownHandlers();
      httpServer.removeListener('error', handleRuntimeError);
      closeRunningServer((timedOut) => {
        if (timedOut) {
          // A force-close means open handles were left dangling. Reject so the
          // caller (CLI or library) decides exit-code policy — startServer is
          // publicly importable, so silently poisoning process.exitCode would
          // hurt library embedders.
          reject(
            new ServerError(
              Object.assign(new Error('Shutdown timeout'), { code: 'ESHUTDOWN' }),
              port,
              'runtime',
            ),
          );
          return;
        }
        resolve();
      });
    };

    const handleStartupError = (error: NodeJS.ErrnoException) => {
      safeCloseWatcher();
      removeShutdownHandlers();
      reject(handleServerError(error, port));
    };

    const handleRuntimeError = (error: NodeJS.ErrnoException) => {
      const runtimeError = handleServerError(error, port, 'runtime');
      removeShutdownHandlers();
      httpServer.removeListener('error', handleRuntimeError);
      closeRunningServer(() => reject(runtimeError));
    };

    httpServer.once('error', handleStartupError);
    httpServer.listen(port, () => {
      httpServer.removeListener('error', handleStartupError);
      httpServer.on('error', handleRuntimeError);

      const url = `http://localhost:${port}`;
      logger.info(`Server running at ${url} and monitoring for new evals.`);
      openBrowser(browserBehavior, port).catch((error) => {
        logger.error(
          `Failed to handle browser behavior (${BrowserBehaviorNames[browserBehavior]}): ${error instanceof Error ? error.message : error}`,
        );
      });
      // Don't resolve - server runs until shutdown signal
    });

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
