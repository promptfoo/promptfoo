import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/server/services/promptCacheService', () => ({
  promptCacheService: {
    getAll: vi.fn(),
    invalidate: vi.fn(),
  },
}));

import logger from '../../src/logger';
import { createApp } from '../../src/server/server';
import { promptCacheService } from '../../src/server/services/promptCacheService';
import { handleRequestError } from '../../src/server/utils/errors';

// Express's own error handler writes the stack trace into the response unless NODE_ENV is
// `production`, and the server is usually started without it.
const STACK_FRAME = /node_modules|\.[cm]?[jt]s:\d+:\d+|\n\s+at /;

describe('server error responses', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = createApp();
  });

  it('answers malformed JSON with a 400 and no stack trace', async () => {
    const response = await request(app)
      .post('/api/telemetry')
      .set('Content-Type', 'application/json')
      .send('{bad json');

    expect(response.status).toBe(400);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ error: 'Bad Request' });
    expect(response.text).not.toMatch(STACK_FRAME);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('answers a failing route with a generic 500 and logs the cause', async () => {
    const failure = new Error('SQLITE_BUSY: database is locked (/home/promptfoo/.promptfoo)');
    vi.mocked(promptCacheService.getAll).mockRejectedValueOnce(failure);

    const response = await request(app).get('/api/prompts');

    expect(response.status).toBe(500);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(response.text).not.toMatch(STACK_FRAME);
    expect(response.text).not.toContain('SQLITE_BUSY');
    expect(logger.error).toHaveBeenCalledWith('Internal server error', {
      error: expect.objectContaining({ message: failure.message, stack: failure.stack }),
    });
  });

  it('answers an undecodable URL with a 400 and no stack trace', async () => {
    const response = await request(app).get('/api/results/%E0%A4%A');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Bad Request' });
    expect(response.text).not.toMatch(STACK_FRAME);
  });
});

describe('server error responses for static files', () => {
  let staticDir: string;

  beforeEach(() => {
    vi.resetAllMocks();
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-static-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<html></html>');
  });

  afterEach(() => {
    fs.rmSync(staticDir, { recursive: true, force: true });
  });

  it('labels the error as JSON after a file handler has set its own content type', async () => {
    const app = express();
    app.use(express.static(staticDir));
    app.use(handleRequestError);

    // The file's headers are already set when the range turns out to be unsatisfiable.
    const response = await request(app).get('/index.html').set('Range', 'bytes=999-');

    expect(response.status).toBe(416);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ error: 'Range Not Satisfiable' });
    expect(response.headers['content-range']).toBe('bytes */13');
  });
});
