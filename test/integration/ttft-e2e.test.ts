import type { Server } from 'http';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpProvider } from '../../src/providers/http';

const output = 'Code is poetry in motion';
const transformResponse = `(_json, text) => String(text).split('\\n')
  .filter(line => line.startsWith('data: {'))
  .map(line => JSON.parse(line.slice(6)).choices[0].delta.content || '')
  .join('')`;

describe('HTTP streaming over a local connection', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post('/stream', (_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      const chunks = [
        { role: 'assistant' },
        { content: 'Code is poetry' },
        { content: ' in motion' },
      ];
      let index = 0;
      const send = () => {
        if (index === chunks.length) {
          res.end('data: [DONE]\n\n');
          return;
        }
        res.write(`data: ${JSON.stringify({ choices: [{ delta: chunks[index++] }] })}\n\n`);
        setTimeout(send, 20);
      };
      send();
    });
    app.post('/json', (_req, res) => res.json({ output }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          url = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each([undefined, 'openai-chat'] as const)(
    'preserves output and ordered metrics with streamFormat=%s',
    async (streamFormat) => {
      const provider = new HttpProvider(`${url}/stream`, {
        config: {
          method: 'POST',
          body: { stream: true },
          streamFormat,
          transformResponse,
        },
      });
      const result = await provider.callApi('Test');
      const metrics = result.streamingMetrics!;

      expect(result.output).toBe(output);
      expect(result.cached).toBe(false);
      expect(result.raw).toContain('data: [DONE]');
      expect(metrics.completionChars).toBe(output.length);
      expect(Number.isFinite(metrics.timeToFirstToken)).toBe(true);
      expect(metrics.timeToFirstToken).toBeGreaterThanOrEqual(0);
      expect(metrics.timeToFirstToken).toBeLessThanOrEqual(result.latencyMs!);
      expect(metrics.totalStreamTime).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.multiChunkDelivery).toBe('boolean');
      if (metrics.tokensPerSecond !== undefined) {
        expect(Number.isFinite(metrics.tokensPerSecond)).toBe(true);
        expect(metrics.tokensPerSecond).toBeGreaterThan(0);
      }
    },
  );

  it('keeps ordinary JSON responses free of streaming metrics', async () => {
    const provider = new HttpProvider(`${url}/json`, {
      config: { method: 'POST', body: { stream: false }, transformResponse: 'json.output' },
    });
    const result = await provider.callApi('Test');
    expect(result.output).toBe(output);
    expect(result.streamingMetrics).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
