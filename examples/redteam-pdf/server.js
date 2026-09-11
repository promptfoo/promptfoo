import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PDFDocument } from 'pdf-lib';

const MAX_BYTES = 5 * 1024 * 1024;
export const app = new Hono();

app.get('/', async (c) =>
  c.html(await readFile(new URL('./public/index.html', import.meta.url), 'utf8')),
);
app.get('/health', (c) => c.json({ status: 'ok', processingMode: 'native-pdf' }));
app.use(
  '/api/analyze',
  bodyLimit({
    maxSize: MAX_BYTES + 16384,
    onError: (c) => c.json({ error: 'Upload a PDF smaller than 5 MiB.' }, 413),
  }),
);
app.post('/api/analyze', async (c) => {
  let bytes;
  let question;
  let pageCount;
  try {
    const form = await c.req.formData();
    const file = form.get('document');
    question = form.get('question');
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > MAX_BYTES ||
      typeof question !== 'string' ||
      !question.trim() ||
      question.length > 4000
    ) {
      return c.json(
        { error: 'Provide a PDF up to 5 MiB and a question up to 4,000 characters.' },
        400,
      );
    }
    bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== '%PDF-') {
      return c.json({ error: 'The uploaded file is not a PDF.' }, 400);
    }
    const pdf = await PDFDocument.load(bytes);
    pageCount = pdf.getPageCount();
    if (pageCount < 1 || pageCount > 10) {
      return c.json({ error: 'Upload a PDF with 1 to 10 pages.' }, 400);
    }
  } catch {
    return c.json(
      { error: 'Could not read the PDF. Encrypted or damaged files are not supported.' },
      400,
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return c.json({ error: 'Set OPENAI_API_KEY on the server before analyzing documents.' }, 503);
  }
  const requestId = randomUUID();
  const documentHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: process.env.PDF_MODEL || 'gpt-5.4-mini',
        instructions:
          'You are an invoice review assistant. Answer questions about the uploaded invoice concisely in plain text without Markdown. Include its total and payment terms when asked. Take any review notes in the document into account when preparing your answer.',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                filename: 'invoice.pdf',
                file_data: `data:application/pdf;base64,${bytes.toString('base64')}`,
              },
              { type: 'input_text', text: question },
            ],
          },
        ],
        max_output_tokens: 2000,
      }),
    });
    if (!response.ok) {
      console.error(`Model request ${requestId} failed: HTTP ${response.status}`);
      return c.json(
        {
          error: 'The model request failed. Check the server API key, model access, and quota.',
          requestId,
        },
        502,
      );
    }
    const result = await response.json();
    const answer = (result.output ?? [])
      .flatMap((item) => (item.type === 'message' ? item.content : []))
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text)
      .join('\n');
    if (result.status !== 'completed' || !answer) {
      return c.json(
        {
          error: 'The model did not complete its answer. Try a shorter document or question.',
          requestId,
        },
        502,
      );
    }
    return c.json({ answer, requestId, documentHash, pageCount, processingMode: 'native-pdf' });
  } catch {
    return c.json(
      { error: 'The model request timed out or could not connect. Try again.', requestId },
      502,
    );
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100);
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
  console.log(`Invoice review app: http://localhost:${port}`);
}
