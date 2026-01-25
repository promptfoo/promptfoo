import fs from 'node:fs';
import path from 'node:path';

import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { z } from 'zod';

import { VERSION } from '../../constants';
import { getDirectory } from '../../esm';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import Eval, { getEvalSummaries } from '../../models/eval';
import { getRemoteHealthUrl } from '../../redteam/remoteGeneration';
import { createShareableUrl, determineShareDomain, stripAuthFromUrl } from '../../share';
import telemetry, { TelemetryEventSchema } from '../../telemetry';
import { synthesizeFromTestSuite } from '../../testCase/synthesis';
import { checkRemoteHealth } from '../../util/apiHealth';
import {
  getPrompts,
  getPromptsForTestCasesHash,
  getStandaloneEvals,
  getTestCases,
  readResult,
} from '../../util/database';
import invariant from '../../util/invariant';
import { setJavaScriptMimeType } from './middleware/mimeType';
import { createSpaFallback } from './middleware/spaFallback';
import { blobsRouter } from './routes/blobs';
import { configsRouter } from './routes/configs';
import { evalRouter } from './routes/eval';
import { mediaRouter } from './routes/media';
import { modelAuditRouter } from './routes/modelAudit';
import { providersRouter } from './routes/providers';
import { redteamRouter } from './routes/redteam';
import { tracesRouter } from './routes/traces';
import { userRouter } from './routes/user';
import { versionRouter } from './routes/version';

import type { Prompt, PromptWithMetadata, TestCase, TestSuite } from '../../index';

// Body size limit (100MB for large eval payloads)
const MAX_BODY_SIZE = 100 * 1024 * 1024;

// Prompts cache
let allPrompts: PromptWithMetadata[] | null = null;

/**
 * Reset the prompts cache (called when evals are updated).
 */
export function resetPromptsCache(): void {
  allPrompts = null;
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

/**
 * Creates the Hono application with all middleware and routes configured.
 */
export function createHonoApp() {
  const app = new Hono();
  const staticDir = findStaticDir();

  // Global middleware
  app.use('*', cors());
  app.use('*', compress());

  // JavaScript MIME type middleware (runs after response)
  app.use('*', setJavaScriptMimeType);

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({ status: 'OK', version: VERSION });
  });

  // Remote health check
  app.get('/api/remote-health', async (c) => {
    const apiUrl = getRemoteHealthUrl();

    if (apiUrl === null) {
      return c.json({
        status: 'DISABLED',
        message: 'remote generation and grading are disabled',
      });
    }

    const result = await checkRemoteHealth(apiUrl);
    return c.json(result);
  });

  // Fetches summaries of all evals
  app.get('/api/results', async (c) => {
    const datasetId = c.req.query('datasetId');
    const type = c.req.query('type') as 'redteam' | 'eval' | undefined;
    const includeProviders = c.req.query('includeProviders') === 'true';

    const previousResults = await getEvalSummaries(datasetId, type, includeProviders);
    return c.json({ data: previousResults });
  });

  // Get specific result by ID
  app.get('/api/results/:id', async (c) => {
    const id = c.req.param('id');
    const file = await readResult(id);
    if (!file) {
      return c.text('Result not found', 404);
    }
    return c.json({ data: file.result });
  });

  // Get all prompts
  app.get('/api/prompts', async (c) => {
    if (allPrompts == null) {
      allPrompts = await getPrompts();
    }
    return c.json({ data: allPrompts });
  });

  // Get eval history
  app.get('/api/history', async (c) => {
    const tagName = c.req.query('tagName');
    const tagValue = c.req.query('tagValue');
    const description = c.req.query('description');
    const tag = tagName && tagValue ? { key: tagName, value: tagValue } : undefined;
    const results = await getStandaloneEvals({
      tag,
      description,
    });
    return c.json({ data: results });
  });

  // Get prompts for a specific test cases hash
  app.get('/api/prompts/:sha256hash', async (c) => {
    const sha256hash = c.req.param('sha256hash');
    const prompts = await getPromptsForTestCasesHash(sha256hash);
    return c.json({ data: prompts });
  });

  // Get all datasets
  app.get('/api/datasets', async (c) => {
    return c.json({ data: await getTestCases() });
  });

  // Check share domain
  app.get('/api/results/share/check-domain', async (c) => {
    const id = c.req.query('id');
    if (!id || id === 'undefined') {
      logger.warn(`Missing or invalid id parameter in ${c.req.method} ${c.req.path}`);
      return c.json({ error: 'Missing id parameter' }, 400);
    }

    const eval_ = await Eval.findById(id);
    if (!eval_) {
      logger.warn(`Eval not found for id: ${id}`);
      return c.json({ error: 'Eval not found' }, 404);
    }

    const { domain } = determineShareDomain(eval_);
    const isCloudEnabled = cloudConfig.isEnabled();
    return c.json({ domain, isCloudEnabled });
  });

  // Share results
  app.post('/api/results/share', async (c) => {
    const { id } = await c.req.json();
    logger.debug(`[${c.req.method} ${c.req.path}] Share request for eval ID: ${id || 'undefined'}`);

    const result = await readResult(id);
    if (!result) {
      logger.warn(`Result not found for id: ${id}`);
      return c.json({ error: 'Eval not found' }, 404);
    }
    const eval_ = await Eval.findById(id);
    invariant(eval_, 'Eval not found');

    try {
      const url = await createShareableUrl(eval_, { showAuth: true });
      logger.debug(`Generated share URL for eval ${id}: ${stripAuthFromUrl(url || '')}`);
      return c.json({ url });
    } catch (error) {
      logger.error(
        `Failed to generate share URL for eval ${id}: ${error instanceof Error ? error.message : error}`,
      );
      return c.json({ error: 'Failed to generate share URL' }, 500);
    }
  });

  // Generate dataset
  app.post('/api/dataset/generate', async (c) => {
    const body = await c.req.json();
    const testSuite: TestSuite = {
      prompts: body.prompts as Prompt[],
      tests: body.tests as TestCase[],
      providers: [],
    };
    const results = await synthesizeFromTestSuite(testSuite, {});
    return c.json({ results });
  });

  // Telemetry endpoint
  app.post('/api/telemetry', async (c) => {
    try {
      const body = await c.req.json();
      const result = TelemetryEventSchema.safeParse(body);

      if (!result.success) {
        return c.json(
          { error: 'Invalid request body', details: z.prettifyError(result.error) },
          400,
        );
      }
      const { event, properties } = result.data;
      await telemetry.record(event, properties);
      return c.json({ success: true });
    } catch (error) {
      logger.error(
        `Error processing telemetry request: ${error instanceof Error ? error.message : error}`,
      );
      return c.json({ error: 'Failed to process telemetry request' }, 500);
    }
  });

  // Mount API routers
  app.route('/api/eval', evalRouter);
  app.route('/api/media', mediaRouter);
  app.route('/api/blobs', blobsRouter);
  app.route('/api/providers', providersRouter);
  app.route('/api/redteam', redteamRouter);
  app.route('/api/user', userRouter);
  app.route('/api/configs', configsRouter);
  app.route('/api/model-audit', modelAuditRouter);
  app.route('/api/traces', tracesRouter);
  app.route('/api/version', versionRouter);

  // Static file serving
  app.use(
    '/*',
    serveStatic({
      root: staticDir,
      onNotFound: (_path, c) => {
        // Will be handled by SPA fallback
        c.res = new Response(null, { status: 404 });
      },
    }),
  );

  // SPA fallback for client-side routing (must be after static)
  app.use('*', createSpaFallback(staticDir));

  return { app, staticDir };
}

export { MAX_BODY_SIZE };
