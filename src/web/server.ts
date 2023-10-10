import fs, { Stats } from 'fs';
import path from 'node:path';
import readline from 'node:readline';
import http from 'node:http';
import invariant from 'tiny-invariant';
import { v4 as uuidv4 } from 'uuid';

import debounce from 'debounce';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import opener from 'opener';
import { Server as SocketIOServer } from 'socket.io';
import promptfoo, { EvaluateSummary, EvaluateTestSuite, PromptWithMetadata } from '../index';

import logger from '../logger';
import { getDirectory } from '../esm';
import {
  getLatestResultsPath,
  getPrompts,
  getPromptsForTestCasesHash,
  listPreviousResults,
  readResult,
  filenameToDate,
  getTestCases,
} from '../util';

interface Job {
  status: 'in-progress' | 'complete';
  progress: number;
  total: number;
  result: EvaluateSummary | null;
}

// Running jobs
const evalJobs = new Map<string, Job>();

// Prompts cache
let allPrompts: PromptWithMetadata[] | null = null;

export function startServer(port = 15500, skipConfirmation = false) {
  const app = express();

  const staticDir = path.join(getDirectory(), 'web', 'nextui');

  app.use(cors());
  app.use(compression());
  app.use(express.json());
  app.use(express.static(staticDir));

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
        allPrompts = null;
      }
    }, 250);
    fs.watchFile(latestJsonPath, watcher);

    // Stop watching the file when the socket connection is closed
    socket.on('disconnect', () => {
      fs.unwatchFile(latestJsonPath, watcher);
    });
  });

  app.get('/results', (req, res) => {
    const previousResults = listPreviousResults();
    previousResults.reverse();
    res.json({
      data: previousResults.map((filename) => ({ id: filename, label: filenameToDate(filename) })),
    });
  });

  app.post('/api/eval', (req, res) => {
    const testSuite = req.body as EvaluateTestSuite;
    const id = uuidv4();
    evalJobs.set(id, { status: 'in-progress', progress: 0, total: 0, result: null });

    promptfoo
      .evaluate(
        Object.assign({}, testSuite, {
          writeLatestResults: true,
          sharing: testSuite.sharing ?? true,
        }),
        {
          progressCallback: (progress, total) => {
            const job = evalJobs.get(id);
            invariant(job, 'Job not found');
            job.progress = progress;
            job.total = total;
            console.log(`[${id}] ${progress}/${total}`);
          },
        },
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

  app.get('/api/eval/:id', (req, res) => {
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

  app.get('/results/:filename', (req, res) => {
    const filename = req.params.filename;
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || !listPreviousResults().includes(safeFilename)) {
      res.status(400).send('Invalid filename');
      return;
    }
    const file = readResult(safeFilename);
    if (!file) {
      res.status(404).send('Result not found');
      return;
    }
    res.json({ data: file.result });
  });

  app.get('/api/prompts', (req, res) => {
    if (allPrompts == null) {
      allPrompts = getPrompts();
    }
    res.json({ data: allPrompts });
  });

  app.get('/api/prompts/:sha256hash', (req, res) => {
    const sha256hash = req.params.sha256hash;
    const prompts = getPromptsForTestCasesHash(sha256hash);
    res.json({ data: prompts });
  });

  app.get('/api/datasets', (req, res) => {
    res.json({ data: getTestCases() });
  });

  httpServer.listen(port, () => {
    const url = `http://localhost:${port}`;
    logger.info(`Server listening at ${url}`);

    const openUrl = async () => {
      try {
        logger.info('Press Ctrl+C to stop the server');
        await opener(url);
      } catch (err) {
        logger.error(`Failed to open browser: ${String(err)}`);
      }
    };

    if (skipConfirmation) {
      openUrl();
    } else {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('Do you want to open the browser to the URL? (y/N): ', async (answer) => {
        if (answer.toLowerCase().startsWith('y')) {
          openUrl();
        }
        rl.close();
        logger.info('Press Ctrl+C to stop the server');
      });
    }
  });
}
