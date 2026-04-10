import crypto from 'crypto';
import fs from 'fs';
import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { HttpProvider } from '../../src/providers/http';

interface MockFileSummary {
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  prefix: string;
}

interface MockRequestSummary {
  apiKey: string | null;
  contentType: string | null;
  documentQuery: string | null;
  files: MockFileSummary[];
  method: string | undefined;
  url: string | undefined;
}

const servers: Server[] = [];
const tempDirs: string[] = [];

async function createMultipartDocumentSummarizerServer() {
  let lastRequest: MockRequestSummary | undefined;

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/api/genai/analyze-file') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }

      const apiKey = req.headers['x-api-key'];
      if (apiKey !== 'test-api-key') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid api key' }));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      const contentType = String(req.headers['content-type'] || '');
      const request = new Request(`http://localhost${req.url}`, {
        body,
        headers: { 'content-type': contentType },
        method: req.method,
      });
      const formData = await request.formData();
      const documentQuery = formData.get('documentQuery');
      const files = formData.getAll('files');

      if (typeof documentQuery !== 'string' || documentQuery.trim() === '') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing documentQuery' }));
        return;
      }

      if (files.length === 0 || !files.every((file) => file instanceof File)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing files' }));
        return;
      }

      const summaries: MockFileSummary[] = [];
      for (const file of files as File[]) {
        const buffer = Buffer.from(await file.arrayBuffer());
        summaries.push({
          filename: file.name,
          contentType: file.type,
          sizeBytes: buffer.length,
          sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
          prefix: buffer.subarray(0, 8).toString('utf8'),
        });
      }

      lastRequest = {
        apiKey: String(apiKey),
        contentType,
        documentQuery,
        files: summaries,
        method: req.method,
        url: req.url,
      };

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          summary: `mock summary for ${summaries.length} file(s): ${documentQuery}`,
          fileCount: summaries.length,
          files: summaries,
          documentQuery,
        }),
      );
    } catch {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'mock server failed to parse multipart request' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/api/genai/analyze-file`,
    getLastRequest: () => lastRequest,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('HttpProvider structured multipart requests', () => {
  it('executes the generated-document config emitted by the Cloud HTTP editor defaults', async () => {
    const mockServer = await createMultipartDocumentSummarizerServer();
    const provider = new HttpProvider('http', {
      config: {
        url: mockServer.url,
        method: 'POST',
        headers: {
          'X-API-Key': 'test-api-key',
        },
        multipart: {
          parts: [
            {
              kind: 'file',
              name: 'files',
              filename: 'promptfoo-document.pdf',
              source: {
                type: 'generated',
                generator: 'basic-document',
                format: 'pdf',
              },
            },
            {
              kind: 'field',
              name: 'documentQuery',
              value: '{{prompt}}',
            },
          ],
        },
        transformResponse: 'json.summary',
      },
    });

    const result = await provider.callApi('Summarize this upload');

    expect(result.output).toBe('mock summary for 1 file(s): Summarize this upload');
    expect(mockServer.getLastRequest()).toMatchObject({
      documentQuery: 'Summarize this upload',
      files: [
        expect.objectContaining({
          filename: 'promptfoo-document.pdf',
          contentType: 'application/pdf',
          prefix: '%PDF-1.4',
        }),
      ],
    });
  });

  it('renders path sources with per-test variables before reading local files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-multipart-'));
    tempDirs.push(tempDir);
    const reportPath = path.join(tempDir, 'report-a.txt');
    const standardFileUrl = new URL(`file://${reportPath}`).toString();
    fs.writeFileSync(reportPath, 'report-a contents');

    const mockServer = await createMultipartDocumentSummarizerServer();
    const provider = new HttpProvider('http', {
      config: {
        url: mockServer.url,
        headers: { 'X-API-Key': 'test-api-key' },
        multipart: {
          parts: [
            {
              kind: 'file',
              name: 'files',
              source: {
                type: 'path',
                path: 'file://{{documentPath}}',
              },
            },
            {
              kind: 'field',
              name: 'documentQuery',
              value: '{{prompt}}',
            },
          ],
        },
        transformResponse: 'json.summary',
      },
    });

    await provider.callApi('Summarize local fixture', {
      prompt: { raw: 'Summarize local fixture', label: 'query' },
      vars: {
        documentPath: reportPath,
      },
    });

    expect(mockServer.getLastRequest()).toMatchObject({
      documentQuery: 'Summarize local fixture',
      files: [
        expect.objectContaining({
          filename: 'report-a.txt',
          contentType: 'text/plain',
          sizeBytes: Buffer.byteLength('report-a contents'),
        }),
      ],
    });

    await provider.callApi('Summarize local fixture', {
      prompt: { raw: 'Summarize local fixture', label: 'query' },
      vars: {
        documentPath: standardFileUrl.slice('file://'.length),
      },
    });
    expect(mockServer.getLastRequest()?.files[0]).toMatchObject({
      filename: 'report-a.txt',
      contentType: 'text/plain',
    });
  });

  it('redacts secret-like multipart text fields from debug metadata', async () => {
    const mockServer = await createMultipartDocumentSummarizerServer();
    const provider = new HttpProvider('http', {
      config: {
        url: mockServer.url,
        headers: { 'X-API-Key': 'test-api-key' },
        multipart: {
          parts: [
            {
              kind: 'file',
              name: 'files',
              source: { type: 'generated', format: 'pdf' },
            },
            {
              kind: 'field',
              name: 'documentQuery',
              value: '{{prompt}}',
            },
            {
              kind: 'field',
              name: 'api_key',
              value: 'sk-secret-key-that-should-not-appear-anywhere',
            },
          ],
        },
        transformResponse: 'json.summary',
      },
    });

    const result = await provider.callApi('Query', {
      debug: true,
      prompt: { raw: 'Query', label: 'query' },
      vars: {},
    });

    expect(result.metadata?.multipart.fields).toContainEqual({
      field: 'api_key',
      value: '[REDACTED]',
    });
    expect(result.metadata?.multipart.files[0]).not.toHaveProperty('sha256');
    expect(JSON.stringify(result.metadata)).not.toContain('sk-secret-key');
  });

  it('redacts secret-like multipart filenames from debug metadata', async () => {
    const mockServer = await createMultipartDocumentSummarizerServer();
    const provider = new HttpProvider('http', {
      config: {
        url: mockServer.url,
        headers: { 'X-API-Key': 'test-api-key' },
        multipart: {
          parts: [
            {
              kind: 'file',
              name: 'files',
              filename: 'sk-secret-filename-that-should-not-appear',
              source: { type: 'generated', format: 'pdf' },
            },
            {
              kind: 'field',
              name: 'documentQuery',
              value: '{{prompt}}',
            },
          ],
        },
        transformResponse: 'json.summary',
      },
    });

    const result = await provider.callApi('Query', {
      debug: true,
      prompt: { raw: 'Query', label: 'query' },
      vars: {},
    });

    expect(result.metadata?.multipart.files[0]).toMatchObject({
      field: 'files',
      filename: '[REDACTED]',
      contentType: 'application/pdf',
    });
    expect(result.metadata?.multipart.files[0]).not.toHaveProperty('sha256');
    expect(JSON.stringify(result.metadata)).not.toContain('sk-secret-filename');
  });

  it('rejects incompatible multipart HTTP provider modes before sending requests', () => {
    expect(
      () =>
        new HttpProvider('http', {
          config: {
            request: 'POST / HTTP/1.1\nHost: example.com\n\n{{prompt}}',
            multipart: { parts: [{ kind: 'field', name: 'documentQuery', value: '{{prompt}}' }] },
          },
        }),
    ).toThrow(/cannot include both request and multipart/);

    expect(
      () =>
        new HttpProvider('http', {
          config: {
            body: { prompt: '{{prompt}}' },
            multipart: { parts: [{ kind: 'field', name: 'documentQuery', value: '{{prompt}}' }] },
          },
        }),
    ).toThrow(/cannot include both body and multipart/);
  });

  it('rejects multipart GET requests before rendering the multipart body', async () => {
    const provider = new HttpProvider('http://example.com/upload', {
      config: {
        method: 'GET',
        multipart: {
          parts: [
            {
              kind: 'field',
              name: 'documentQuery',
              value: '{{prompt}}',
            },
          ],
        },
      },
    });

    await expect(provider.callApi('Query')).rejects.toThrow(/GET requests cannot use multipart/);
  });

  it('uploads a generated PDF file with a templated document query', async () => {
    const mockServer = await createMultipartDocumentSummarizerServer();
    const provider = new HttpProvider('http', {
      config: {
        url: mockServer.url,
        headers: {
          'X-API-Key': 'test-api-key',
          // The provider must remove this stale value and let fetch set a boundary.
          'Content-Type': 'multipart/form-data',
        },
        multipart: {
          parts: [
            {
              kind: 'file',
              name: 'files',
              filename: 'sample-report45.pdf',
              source: {
                type: 'generated',
                format: 'pdf',
                text: 'Benign generated report used to test multipart transport.',
              },
            },
            {
              kind: 'field',
              name: 'documentQuery',
              value: '{{prompt}}',
            },
          ],
        },
        transformResponse: 'json.summary',
      },
    });

    const result = await provider.callApi('Give summary of the file', {
      debug: true,
      prompt: { raw: 'Give summary of the file', label: 'query' },
      vars: {},
    });

    expect(result.output).toBe('mock summary for 1 file(s): Give summary of the file');

    const request = mockServer.getLastRequest();
    expect(request).toMatchObject({
      apiKey: 'test-api-key',
      documentQuery: 'Give summary of the file',
      method: 'POST',
      url: '/api/genai/analyze-file',
    });
    expect(request?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(request?.files).toHaveLength(1);
    expect(request?.files[0]).toMatchObject({
      filename: 'sample-report45.pdf',
      contentType: 'application/pdf',
      prefix: '%PDF-1.4',
    });
    expect(request?.files[0].sizeBytes).toBeGreaterThan(100);

    expect(result.metadata?.multipart).toMatchObject({
      fields: [{ field: 'documentQuery', value: 'Give summary of the file' }],
      files: [
        {
          field: 'files',
          filename: 'sample-report45.pdf',
          contentType: 'application/pdf',
          source: 'generated',
        },
      ],
    });
    expect(result.metadata?.multipart.files[0]).not.toHaveProperty('sha256');
    expect(JSON.stringify(result.metadata)).not.toContain('Benign generated report');
  });
});
