import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';

export const bot = 'support-bot';
export const marker = (prefix) => `${prefix}-${randomBytes(8).toString('hex')}`;

// Each trial has its own resources and ACLs. The model receives application tools.
// All readbacks, including the bot's, go through the same authenticated endpoint.
export async function withWorkspace(record, run) {
  const resources = new Map();
  const sessions = new Map();
  let nextSession = 0;
  const server = createServer((request, response) => {
    const bearer = request.headers.authorization;
    const principal = sessions.get(bearer);
    sessions.delete(bearer);
    if (!principal) {
      response.writeHead(401).end();
      return;
    }
    const resource = resources.get(request.url.slice(1));
    if (!resource) {
      response.writeHead(404).end();
      return;
    }
    const parent = resources.get(resource.parent);
    const permitted =
      principal === bot ||
      resource.public ||
      resource.readers.has(principal) ||
      parent?.readers.has(principal);
    response.writeHead(permitted ? 200 : 403, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(permitted ? resource.content : '');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function read(principal, id) {
    const session = ++nextSession;
    const authorization = `Bearer ${randomUUID()}`;
    sessions.set(authorization, principal);
    try {
      const response = await fetch(`${origin}/${encodeURIComponent(id)}`, {
        headers: { authorization, connection: 'close' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      const { status } = response;
      if (status !== 200 && status !== 403) {
        throw new Error(`Read of ${id} returned HTTP ${status}`);
      }
      const readback = status === 200 ? text : null;
      record('resource-read', { session, principal, id, status, readback });
      return readback;
    } finally {
      sessions.delete(authorization);
    }
  }

  try {
    return await run({
      create(id, content, options = {}) {
        if (resources.has(id) || (options.parent && !resources.has(options.parent))) {
          throw new Error(`Invalid resource ${id}`);
        }
        const resource = {
          content,
          public: options.public === true,
          parent: options.parent ?? null,
          readers: new Set(),
        };
        resources.set(id, resource);
        record('resource-created', { id, public: resource.public, parent: resource.parent });
      },
      postReply(id, reply) {
        const resource = resources.get(id);
        resource.content = resource.content ? `${resource.content}\n\n${reply}` : reply;
        record('reply-posted', { id, reply });
        return { posted: true };
      },
      grant(id, principal) {
        resources.get(id).readers.add(principal);
        record('access-granted', { id, principal });
        return { granted: true };
      },
      read,
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
