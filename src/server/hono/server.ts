import http from 'node:http';

import { Server as SocketIOServer } from 'socket.io';

import { getDefaultPort } from '../../constants';
import { readSignalEvalId, setupSignalWatcher } from '../../database/signal';
import logger from '../../logger';
import { runDbMigrations } from '../../migrate';
import Eval from '../../models/eval';
import { BrowserBehavior, BrowserBehaviorNames, openBrowser } from '../../util/server';
import { createHonoApp, resetPromptsCache } from './app';

import type { Hono } from 'hono';

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
 * Converts a Hono app to a Node.js HTTP request handler.
 * This allows Socket.io to share the same HTTP server.
 */
function honoToNodeHandler(app: Hono) {
  return async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    try {
      // Build the full URL
      const protocol = 'http';
      const host = req.headers.host || 'localhost';
      const url = `${protocol}://${host}${req.url}`;

      // Collect body for non-GET/HEAD requests
      let body: Buffer | undefined;
      if (req.method && !['GET', 'HEAD'].includes(req.method)) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }

      // Create a fetch Request from the Node request
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }

      const request = new Request(url, {
        method: req.method || 'GET',
        headers,
        body: body ? new Uint8Array(body) : undefined,
      });

      // Get response from Hono
      const response = await app.fetch(request);

      // Write response to Node.js response
      res.statusCode = response.status;

      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            res.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      }

      res.end();
    } catch (error) {
      logger.error(`Request handling error: ${error instanceof Error ? error.message : error}`);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  };
}

/**
 * Starts the Hono server with Socket.io integration.
 */
export async function startHonoServer(
  port = getDefaultPort(),
  browserBehavior: BrowserBehavior = BrowserBehavior.ASK,
): Promise<void> {
  const { app } = createHonoApp();

  // Create HTTP server that both Hono and Socket.io can use
  const httpServer = http.createServer(honoToNodeHandler(app));

  // Attach Socket.io to the same HTTP server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  await runDbMigrations();

  // Set up file watcher for eval updates
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
        io.emit('update', updatedEval);
        resetPromptsCache();
      }
    };

    void handleSignalUpdate();
  });

  // Handle Socket.io connections
  io.on('connection', async (socket) => {
    socket.emit('init', await Eval.latest());
  });

  // Return a Promise that only resolves when the server shuts down
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
      })
      .on('error', (error: NodeJS.ErrnoException) => {
        handleServerError(error, port);
      });

    // Graceful shutdown handlers
    const shutdown = () => {
      logger.info('Shutting down server...');

      watcher.close();

      const SHUTDOWN_TIMEOUT_MS = 5000;
      const forceCloseTimeout = setTimeout(() => {
        logger.warn('Server close timeout - forcing shutdown');
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);

      io.close(() => {
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
