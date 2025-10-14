const http = require('http');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || '127.0.0.1';

const sessions = new Map();

const parseJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/sessions') {
      const body = await parseJsonBody(req);
      const sessionId = randomUUID();
      sessions.set(sessionId, {
        turns: [],
        vars: body?.vars || {},
      });
      sendJson(res, 201, { sessionId });
      return;
    }

    if (
      req.method === 'POST' &&
      req.url.startsWith('/sessions/') &&
      req.url.endsWith('/messages')
    ) {
      const [, , rawSessionId] = req.url.split('/');
      const sessionId = rawSessionId;
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'Unknown session id' });
        return;
      }

      const body = await parseJsonBody(req);
      const userMessage = body?.message || '';
      session.turns.push({ role: 'user', message: userMessage });

      const hostReplies = session.turns.filter((turn) => turn.role === 'assistant');
      const reply = `Host reply #${hostReplies.length + 1}: thanks for asking! (${userMessage.slice(0, 40)})`;
      session.turns.push({ role: 'assistant', message: reply });

      sendJson(res, 200, {
        sessionId,
        reply,
        conversationLength: session.turns.length,
        turns: session.turns,
      });
      return;
    }

    if (req.method === 'DELETE' && req.url.startsWith('/sessions/')) {
      const sessionId = req.url.split('/')[2];
      sessions.delete(sessionId);
      sendJson(res, 204, {});
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock session service listening on http://${HOST}:${PORT}`);
});
