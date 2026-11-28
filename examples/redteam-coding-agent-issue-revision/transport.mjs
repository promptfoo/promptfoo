import http from 'node:http';
import https from 'node:https';

const MAX_BYTES = 1024 * 1024;

export function endpoint(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    throw new Error('Invalid endpoint');
  }
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Unexpected URL credentials, query or fragment');
  }
  if (url.protocol === 'http:') {
    // Do not rely on DNS for a cleartext connection carrying a credential.
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
    }
    if (!['127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Remote endpoint requires HTTPS');
    }
  }
  return url;
}

/** One direct POST. Never redirect, replay, or include provider data in errors. */
export async function postModelJson({ url, body, apiKey, signal }) {
  let requests = 0;
  try {
    const target = endpoint(url);
    if (apiKey !== undefined && (typeof apiKey !== 'string' || !/^[!-~]+$/.test(apiKey))) {
      throw new Error('Invalid API key');
    }
    const payload = JSON.stringify(body);
    const size = Buffer.byteLength(payload);
    if (size > MAX_BYTES) {
      throw new Error('Model request exceeds size limit');
    }
    const deadline = AbortSignal.timeout(60_000);
    const timeout = signal ? AbortSignal.any([signal, deadline]) : deadline;
    timeout.throwIfAborted();
    const transport = target.protocol === 'https:' ? https : http;
    const response = await new Promise((resolve, reject) => {
      const request = transport.request(target, {
        method: 'POST',
        agent: false,
        rejectUnauthorized: true,
        signal: timeout,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': size,
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
      });
      request.once('response', resolve);
      request.once('upgrade', (_response, socket) => {
        socket.destroy();
        reject(new Error('Protocol upgrade refused'));
      });
      request.once('error', reject);
      requests = 1;
      request.end(payload);
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy();
      throw new Error('Unexpected model status');
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        throw new Error('Model response exceeds size limit');
      }
      chunks.push(chunk);
    }
    timeout.throwIfAborted();
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw Object.assign(new Error('Model request failed'), { requests });
  }
}
