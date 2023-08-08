// Note that this file isn't processed by Vite, see https://github.com/brillout/vite-plugin-ssr/issues/562

import invariant from 'tiny-invariant';
import express from 'express';
import compression from 'compression';
import { renderPage } from 'vite-plugin-ssr/server';
import { root } from './root.js';
import { v4 as uuidv4 } from 'uuid';

import promptfoo, {EvaluateSummary} from '../../../../dist/src/index.js';

interface Job {
  status: 'in-progress' | 'completed';
  progress: number;
  total: number;
  result: EvaluateSummary | null;
}

const evalJobs = new Map<string, Job>();

const isProduction = process.env.NODE_ENV === 'production';

startServer();

async function startServer() {
  const app = express();

  app.use(compression());
  app.use(express.json());

  if (isProduction) {
    const sirv = (await import('sirv')).default;
    app.use(sirv(`${root}/dist/client`));
  } else {
    const vite = await import('vite');
    const viteDevMiddleware = (
      await vite.createServer({
        root,
        server: { middlewareMode: true },
      })
    ).middlewares;
    app.use(viteDevMiddleware);
  }

  app.post('/api/eval', (req, res) => {
    const testSuite = req.body;
    const id = uuidv4();
    evalJobs.set(id, { status: 'in-progress', progress: 0, total: 0, result: null });

    promptfoo.evaluate(
      Object.assign({}, testSuite, { writeLatestResults: true }),
      {
        progressCallback: (progress, total) => {
          const job = evalJobs.get(id);
          invariant(job, 'Job not found');
          job.progress = progress;
          job.total = total;
          console.log(`Progress: ${progress}/${total}`);
        },
      },
    ).then(result => {
      const job = evalJobs.get(id);
      invariant(job, 'Job not found');
      job.status = 'completed';
      job.result = result;
    });

    res.json({ id });
  });

  app.get('/api/eval/:id', (req, res) => {
    const id = req.params.id;
    const job = evalJobs.get(id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (job.status === 'completed') {
      res.json(job.result);
    } else {
      res.json({ status: 'in-progress', progress: job.progress, total: job.total });
    }
  });

  app.get('*', async (req, res, next) => {
    const pageContextInit = {
      urlOriginal: req.originalUrl,
    };
    const pageContext = await renderPage(pageContextInit);
    const { httpResponse } = pageContext;
    if (!httpResponse) return next();
    const { body, statusCode, contentType, earlyHints } = httpResponse;
    if (res.writeEarlyHints) res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) });
    res.status(statusCode).type(contentType).send(body);
  });

  const port = process.env.PORT || 3000;
  app.listen(port);
  console.log(`Server running at http://localhost:${port}`);
}
