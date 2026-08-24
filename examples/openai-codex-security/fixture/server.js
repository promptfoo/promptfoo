const { exec } = require('node:child_process');
const { createServer } = require('node:http');

// Intentionally vulnerable fixture for Codex Security evals. Never expose this server.
createServer((request, response) => {
  const ref = new URL(request.url, 'http://localhost').searchParams.get('ref');

  exec(`git show ${ref}`, (error, output) => {
    if (error) {
      response.writeHead(500).end('Unable to load the requested revision');
      return;
    }

    response.writeHead(200).end(output);
  });
}).listen(3000);
