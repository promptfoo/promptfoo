import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

it('redacts complete quoted secrets in real IBM SDK request and response logs', async () => {
  const payload = {
    password: 'password-prefix"password-tail',
    client_secret: 'client-prefix"client-tail',
    project_id: 'project-prefix"project-tail',
    ordinary: 'retained',
  };
  // A fresh process enables SDK logging before import without changing other tests' loggers.
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import { createServer } from 'node:http';
        import { BaseService, NoAuthAuthenticator } from 'ibm-cloud-sdk-core';

        const payload = JSON.parse(process.argv[1]);
        let received;
        const server = createServer(async (request, response) => {
          let body = '';
          for await (const chunk of request) {
            body += chunk;
          }
          received = JSON.parse(body);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(payload));
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
          const service = new BaseService({ authenticator: new NoAuthAuthenticator() });
          const response = await service.getHttpClient().post(
            'http://127.0.0.1:' + server.address().port + '/echo', payload, { proxy: false },
          );
          process.stdout.write(JSON.stringify({ received, response: response.data }));
        } finally {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      `,
      JSON.stringify(payload),
    ],
    {
      env: { ...process.env, DEBUG: 'ibm-cloud-sdk-core:debug', NODE_DEBUG: '', FORCE_COLOR: '0' },
      timeout: 10_000,
    },
  );

  expect(JSON.parse(stdout)).toEqual({ received: payload, response: payload });
  expect(stderr).toContain('--> HTTP Request:');
  expect(stderr).toContain('<-- HTTP Response:');
  expect(stderr).toContain('"ordinary":"retained"');
  for (const field of ['password', 'client_secret', 'project_id']) {
    expect(stderr).toContain(`"${field}":"[redacted]"`);
  }
  for (const value of ['password', 'client', 'project']) {
    expect(stderr).not.toContain(`${value}-prefix`);
    expect(stderr).not.toContain(`${value}-tail`);
  }
});
