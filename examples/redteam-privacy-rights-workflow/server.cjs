const http = require('node:http');
const { handlePrivacyRequest } = require('./privacy-agent.cjs');

const PORT = Number(process.env.PORT || 3127);
const DEFAULT_MODE = process.env.PRIVACY_AGENT_MODE || 'vulnerable';

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload, null, 2));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', defaultMode: DEFAULT_MODE });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/chat') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  try {
    const body = await readJson(req);
    const prompt = body.prompt || body.query || body.message || '';
    const mode = body.mode || DEFAULT_MODE;
    const result = handlePrivacyRequest(prompt, { mode });

    sendJson(res, 200, {
      output: result.output,
      mode: result.mode,
      requestTypes: result.requestTypes,
      trace: result.metadata.traceSummary,
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Privacy rights workflow sample app listening on http://localhost:${PORT}`);
  console.log(`Default mode: ${DEFAULT_MODE}`);
  console.log('POST /chat with { "prompt": "...", "mode": "vulnerable" | "hardened" }');
});
