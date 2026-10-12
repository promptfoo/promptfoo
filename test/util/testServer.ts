import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import type { Express } from 'express';

/** Keep one loopback server and cookie-preserving agent for the entire suite. */
export function setupTestServer(createApp: () => Express, beforeStart?: () => Promise<unknown>) {
  let server: Server;
  let api: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    if (beforeStart) {
      await beforeStart();
    }
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  // Forward methods lazily after beforeAll creates the real agent.
  return new Proxy({} as ReturnType<typeof request.agent>, {
    get(_target, property) {
      const member = Reflect.get(api, property, api);
      return typeof member === 'function' ? member.bind(api) : member;
    },
  });
}
