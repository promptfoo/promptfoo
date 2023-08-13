// Note that this file isn't processed by Vite, see https://github.com/brillout/vite-plugin-ssr/issues/562

import fs, { Stats } from 'fs';
import path from 'node:path';
import readline from 'node:readline';
import http from 'node:http';

import compression from 'compression';
import debounce from 'debounce';
import express from 'express';
import invariant from 'tiny-invariant';
import opener from 'opener';
import { Server as SocketIOServer } from 'socket.io';
import { renderPage } from 'vite-plugin-ssr/server';
import { v4 as uuidv4 } from 'uuid';

import { root } from './root.js';
import promptfoo, { EvaluateSummary } from '../../../../src/index';
import { getLatestResultsPath, listPreviousResults, readResult } from '../../../../src/util';

interface Job {
  status: 'in-progress' | 'completed';
  progress: number;
  total: number;
  result: EvaluateSummary | null;
}

const evalJobs = new Map<string, Job>();

const isProduction = process.env.NODE_ENV === 'production';

export async function startServer(port?: number) {
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

    promptfoo
      .evaluate(Object.assign({}, testSuite, { writeLatestResults: true }), {
        progressCallback: (progress, total) => {
          const job = evalJobs.get(id);
          invariant(job, 'Job not found');
          job.progress = progress;
          job.total = total;
          console.log(`Progress: ${progress}/${total}`);
        },
      })
      .then((result) => {
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
      res.json({ status: 'completed', result: job.result });
    } else {
      res.json({ status: 'in-progress', progress: job.progress, total: job.total });
    }
  });

  app.get('/results', (req, res) => {
    const previousResults = listPreviousResults();
    res.json({ data: previousResults });
  });

  app.get('/results/:filename', (req, res) => {
    const filename = req.params.filename;
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || !listPreviousResults().includes(safeFilename)) {
      res.status(400).send('Invalid filename');
      return;
    }
    const result = readResult(safeFilename);
    if (!result) {
      res.status(404).send('Result not found');
      return;
    }
    res.json({ data: result });
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

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const latestJsonPath = getLatestResultsPath();
  const readLatestJson = () => {
    const data = fs.readFileSync(latestJsonPath, 'utf8');
    return JSON.parse(data);
  };

  io.on('connection', (socket) => {
    // Send the initial table data when a client connects
    socket.emit('init', readLatestJson());

    // Watch for changes to latest.json and emit the update event
    const watcher = debounce((curr: Stats, prev: Stats) => {
      if (curr.mtime !== prev.mtime) {
        socket.emit('update', readLatestJson());
      }
    }, 250);
    fs.watchFile(latestJsonPath, watcher);

    // Stop watching the file when the socket connection is closed
    socket.on('disconnect', () => {
      fs.unwatchFile(latestJsonPath, watcher);
    });
  });

  const listenPort = port || process.env.PORT || 15500;
  httpServer.listen(listenPort, () => {
    const url = `http://localhost:${listenPort}`;
    console.log(`Server listening at ${url}`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Do you want to open the browser to the URL? (y/N): ', async (answer) => {
      if (answer.toLowerCase().startsWith('y')) {
        try {
          await opener(url);
          console.log(`Opening browser to: ${url}`);
        } catch (err) {
          console.error(`Failed to open browser: ${String(err)}`);
        }
      }
      rl.close();
      console.log('Press Ctrl+C to stop the server');
    });
  });
}
