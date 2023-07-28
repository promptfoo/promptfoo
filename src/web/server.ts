import fs, { Stats } from 'fs';
import path from 'node:path';
import readline from 'node:readline';
import http from 'node:http';

import debounce from 'debounce';
import express from 'express';
import cors from 'cors';
import opener from 'opener';
import { Server as SocketIOServer } from 'socket.io';

import logger from '../logger';
import { getDirectory } from '../esm';
import { getLatestResultsPath, listPreviousResults, readResult } from '../util';

export function init(port = 15500) {
  const app = express();

  const staticDir = path.join(getDirectory(), 'web', 'client');

  app.use(cors());
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

  httpServer.listen(port, () => {
    const url = `http://localhost:${port}`;
    logger.info(`Server listening at ${url}`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Do you want to open the browser to the URL? (y/N): ', async (answer) => {
      if (answer.toLowerCase().startsWith('y')) {
        try {
          await opener(url);
          logger.info(`Opening browser to: ${url}`);
        } catch (err) {
          logger.error(`Failed to open browser: ${String(err)}`);
        }
      }
      rl.close();
      logger.info('Press Ctrl+C to stop the server');
    });
  });
}
