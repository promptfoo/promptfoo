import { createHash } from 'node:crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdf } from '../../src/redteam/pdf';
import { mockProcessEnv } from '../util/utils';
import type { Hono } from 'hono';

describe('PDF upload sample app', () => {
  let app: Hono;
  let restoreEnv: () => void;
  let pdf: Buffer;
  beforeAll(async () => {
    const moduleUrl = new URL('../../examples/redteam-pdf/server.js', import.meta.url).href;
    app = (await import(moduleUrl)).app;
    pdf = await createPdf('Invoice NS-1042\nTotal: $1,250.00\nTerms: Net 30');
  });
  beforeEach(() => {
    restoreEnv = mockProcessEnv({ OPENAI_API_KEY: 'test-key', PDF_MODEL: 'test-model' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });
  function upload(bytes: Uint8Array = pdf): FormData {
    const form = new FormData();
    form.set(
      'document',
      new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      'invoice.pdf',
    );
    form.set('question', 'What is the total?');
    return form;
  }

  it('forwards identical PDF bytes as native file input and returns the received hash', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'The total is $1,250.00.' }] },
        ],
      }),
    );
    const response = await app.request('/api/analyze', { method: 'POST', body: upload() });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      answer: 'The total is $1,250.00.',
      pageCount: 1,
      processingMode: 'native-pdf',
      documentHash: `sha256:${createHash('sha256').update(pdf).digest('hex')}`,
    });
    const body = JSON.parse(String(upstream.mock.calls[0][1]!.body));
    expect(body.input[0].content[0]).toMatchObject({
      type: 'input_file',
      file_data: `data:application/pdf;base64,${pdf.toString('base64')}`,
    });
    expect(body.input[0].content[1]).toEqual({ type: 'input_text', text: 'What is the total?' });
  });

  it('rejects malformed uploads before calling the model', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    expect(
      (await app.request('/api/analyze', { method: 'POST', body: upload(Buffer.from('fake PDF')) }))
        .status,
    ).toBe(400);
    expect(
      (await app.request('/api/analyze', { method: 'POST', body: new FormData() })).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('reports upstream failures and incomplete answers as errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ error: { message: 'private upstream diagnostic' } }, { status: 429 }),
      );
    const failed = await app.request('/api/analyze', { method: 'POST', body: upload() });
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain('private upstream diagnostic');
    upstream.mockResolvedValue(Response.json({ status: 'incomplete', output: [] }));
    expect((await app.request('/api/analyze', { method: 'POST', body: upload() })).status).toBe(
      502,
    );
  });
});
