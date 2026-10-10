import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import https from 'node:https';
import { createRequire } from 'node:module';
import type { ClientRequest, IncomingMessage } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { requestImage, downloadImage } = require('../../scripts/imageGeneration.cjs') as {
  requestImage: (
    data: string,
    apiKey: string,
    contentLength: number,
  ) => Promise<{ url?: string; b64_json?: string }>;
  downloadImage: (url: string, filepath: string) => Promise<void>;
};

function mockHttps(method: 'request' | 'get') {
  const request = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
  const response = Object.assign(new EventEmitter(), { statusCode: 200, resume: vi.fn() });
  let onResponse: (response: IncomingMessage) => void;
  const spy = vi.spyOn(https, method).mockImplementation((...args: unknown[]) => {
    onResponse = args.find((arg) => typeof arg === 'function') as typeof onResponse;
    return request as unknown as ClientRequest;
  });

  return {
    request,
    response,
    spy,
    respond() {
      onResponse(response as unknown as IncomingMessage);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('image generation request', () => {
  it.each(['ASCII prompt', 'Unicode 🐼 café'])(
    'sends the serialized request for %s',
    async (prompt) => {
      const transport = mockHttps('request');
      const data = JSON.stringify({ prompt, model: 'gpt-image-1' });
      const length = Buffer.byteLength(data);
      const result = requestImage(data, 'test-api-key', length);

      expect(transport.spy).toHaveBeenCalledWith(
        {
          hostname: 'api.openai.com',
          port: 443,
          path: '/v1/images/generations',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
            'Content-Length': length,
          },
        },
        expect.any(Function),
      );
      expect(transport.request.write).toHaveBeenCalledWith(data);
      expect(transport.request.end).toHaveBeenCalledTimes(1);

      transport.respond();
      transport.response.emit('data', Buffer.from('{"data":['));
      transport.response.emit('data', '{"b64_json":"aW1hZ2U="}]}');
      transport.response.emit('end');
      await expect(result).resolves.toEqual({ b64_json: 'aW1hZ2U=' });
    },
  );

  it('returns the first generated image', async () => {
    const transport = mockHttps('request');
    const result = requestImage('{}', 'test-api-key', 2);
    transport.respond();
    transport.response.emit(
      'data',
      JSON.stringify({ data: [{ url: 'https://example.com/first.png' }, { b64_json: 'second' }] }),
    );
    transport.response.emit('end');
    await expect(result).resolves.toEqual({ url: 'https://example.com/first.png' });
  });

  it('rejects an API error response', async () => {
    const transport = mockHttps('request');
    const result = requestImage('{}', 'test-api-key', 2);
    const rejected = expect(result).rejects.toThrow('Invalid API key');
    transport.response.statusCode = 401;
    transport.respond();
    transport.response.emit('data', '{"error":{"message":"Invalid API key"}}');
    transport.response.emit('end');
    await rejected;
  });

  it('rejects invalid JSON', async () => {
    const transport = mockHttps('request');
    const result = requestImage('{}', 'test-api-key', 2);
    const rejected = expect(result).rejects.toBeInstanceOf(SyntaxError);
    transport.respond();
    transport.response.emit('data', '<html>Unavailable</html>');
    transport.response.emit('end');
    await rejected;
  });

  it('rejects request connection errors', async () => {
    const transport = mockHttps('request');
    const error = new Error('Connection reset');
    const result = requestImage('{}', 'test-api-key', 2);
    const rejected = expect(result).rejects.toBe(error);
    transport.request.emit('error', error);
    await rejected;
  });
});

describe('image download', () => {
  it('waits for the response to complete before writing all bytes', async () => {
    const transport = mockHttps('get');
    const write = vi.spyOn(fs, 'writeFile').mockResolvedValue();
    const result = downloadImage('https://example.com/image.png', '/output/image.png');
    transport.respond();
    transport.response.emit('data', Buffer.from([0, 1, 255]));
    transport.response.emit('data', 'tail');
    expect(write).not.toHaveBeenCalled();
    transport.response.emit('end');
    await result;
    expect(write).toHaveBeenCalledExactlyOnceWith(
      '/output/image.png',
      Buffer.concat([Buffer.from([0, 1, 255]), Buffer.from('tail')]),
    );
  });

  it.each([404, 500])(
    'drains a rejected HTTP %s response without writing a file',
    async (status) => {
      const transport = mockHttps('get');
      const write = vi.spyOn(fs, 'writeFile').mockResolvedValue();
      const result = downloadImage('https://example.com/image.png', '/output/image.png');
      const rejected = expect(result).rejects.toThrow(`Failed to download image: ${status}`);
      transport.response.statusCode = status;
      transport.respond();
      await rejected;
      expect(transport.response.resume).toHaveBeenCalledTimes(1);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it.each(['request', 'response'] as const)(
    'rejects %s errors without writing a file',
    async (source) => {
      const transport = mockHttps('get');
      const write = vi.spyOn(fs, 'writeFile').mockResolvedValue();
      const error = new Error('Stream failed');
      const result = downloadImage('https://example.com/image.png', '/output/image.png');
      const rejected = expect(result).rejects.toBe(error);
      transport.respond();
      transport[source].emit('error', error);
      await rejected;
      expect(write).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])('preserves write errors when cleanup fails: %s', async (cleanupFails) => {
    const transport = mockHttps('get');
    const error = new Error('Disk full');
    vi.spyOn(fs, 'writeFile').mockRejectedValue(error);
    const unlink = vi.spyOn(fs, 'unlink');
    if (cleanupFails) {
      unlink.mockRejectedValue(new Error('Cleanup failed'));
    } else {
      unlink.mockResolvedValue();
    }
    const result = downloadImage('https://example.com/image.png', '/output/image.png');
    const rejected = expect(result).rejects.toBe(error);
    transport.respond();
    transport.response.emit('data', Buffer.from('image'));
    transport.response.emit('end');
    await rejected;
    expect(unlink).toHaveBeenCalledExactlyOnceWith('/output/image.png');
  });
});
