import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { BaseService, NoAuthAuthenticator } from 'ibm-cloud-sdk-core/index.js';
import { expect, it } from 'vitest';

it('sends IBM SDK HTTPS requests through the configured proxy', async () => {
  const connects: string[] = [];
  const proxy = createServer();
  proxy.on('connect', (request, socket) => {
    connects.push(`${request.method} ${request.url}`);
    // Reject the tunnel locally so this test never contacts the requested origin.
    socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');

  try {
    const service = new BaseService({ authenticator: new NoAuthAuthenticator() });
    await expect(
      service.getHttpClient().get('https://example.invalid/proxy-compat', {
        proxy: { protocol: 'http', host: '127.0.0.1', port: (proxy.address() as AddressInfo).port },
      }),
    ).rejects.toMatchObject({ response: { status: 502 } });
    expect(connects).toEqual(['CONNECT example.invalid:443']);
  } finally {
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
