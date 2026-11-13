import './setup';

import { describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { HttpProvider } from '../../../src/providers/http';

const responseCases = [
  { name: 'false', body: 'false', json: false },
  { name: 'zero', body: '0', json: 0 },
  { name: 'empty JSON string', body: '""', json: '' },
  { name: 'null', body: 'null', json: null },
  { name: 'object', body: '{"answer":false}', json: { answer: false } },
  { name: 'invalid JSON', body: 'not JSON', json: null },
  { name: 'empty response body', body: '', json: null },
];

const parsers = [
  { name: 'expression', transformResponse: 'JSON.stringify({ json, text })' },
  {
    name: 'arrow function string',
    transformResponse: '(json, text) => JSON.stringify({ json, text })',
  },
  {
    name: 'function',
    transformResponse: (json: unknown, text: string) => JSON.stringify({ json, text }),
  },
];

describe.each([false, true])('HttpProvider response transform inputs (raw request: %s)', (raw) => {
  describe.each(parsers)('$name parser', ({ transformResponse }) => {
    it.each(responseCases)('preserves $name and the raw body', async ({ body, json }) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: body,
        status: 200,
        statusText: 'OK',
        cached: false,
      });
      const provider = new HttpProvider('http://example.com/api', {
        config: {
          ...(raw ? { request: 'GET /api HTTP/1.1\nHost: example.com\n\n' } : { method: 'GET' }),
          transformResponse,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe(JSON.stringify({ json, text: body }));
      expect(fetchWithCache).toHaveBeenCalledOnce();
      expect(vi.mocked(fetchWithCache).mock.calls[0][3]).toBe('text');
    });
  });
});
