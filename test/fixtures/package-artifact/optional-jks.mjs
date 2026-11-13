import assert from 'node:assert/strict';
import { verify, X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [format, state] = process.argv.slice(2);
const { loadApiProvider } = format === 'cjs' ? require('promptfoo') : await import('promptfoo');
const packageRequire = createRequire(require.resolve('promptfoo'));
const identity = JSON.parse(fs.readFileSync(new URL('./jks-test-identity.json', import.meta.url)));
if (state === 'missing') {
  for (const name of ['jks-js', 'node-forge']) {
    assert.throws(() => packageRequire.resolve(name), { code: 'MODULE_NOT_FOUND' });
  }
}

const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  const signature = request.headers['x-fixture-signature'];
  const timestamp = request.headers['x-fixture-timestamp'];
  const valid =
    request.url === '/plain' ||
    (typeof signature === 'string' &&
      typeof timestamp === 'string' &&
      /^\d+$/.test(timestamp) &&
      verify(
        'sha256',
        Buffer.from(`fixture:${timestamp}`),
        identity.cert,
        Buffer.from(signature, 'base64'),
      ));
  response.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ output: valid ? 'authenticated fixture' : 'invalid signature' }));
});
const secureServer = createSecureServer(
  {
    key: identity.key,
    cert: identity.cert,
    ca: identity.cert,
    requestCert: true,
    rejectUnauthorized: true,
  },
  (request, response) => {
    requests.push(request.url);
    const valid =
      request.socket.authorized &&
      request.socket.getPeerCertificate().fingerprint256 ===
        new X509Certificate(identity.cert).fingerprint256;
    response.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ output: valid ? 'authenticated fixture' : 'invalid client' }));
  },
);

try {
  for (const listener of [server, secureServer]) {
    await new Promise((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', resolve);
    });
  }

  const signedHeaders = {
    'x-fixture-signature': '{{signature}}',
    'x-fixture-timestamp': '{{signatureTimestamp}}',
  };
  const signatureConfig = {
    signatureAlgorithm: 'SHA256',
    signatureDataTemplate: 'fixture:{{signatureTimestamp}}',
  };
  const cases = [
    { pathname: '/plain', config: {} },
    {
      pathname: '/pem',
      config: {
        headers: signedHeaders,
        signatureAuth: { ...signatureConfig, type: 'pem', privateKey: identity.key },
      },
    },
    {
      pathname: '/jks',
      config: {
        headers: signedHeaders,
        signatureAuth: {
          ...signatureConfig,
          type: 'jks',
          keystoreContent: identity.keystore,
          keystorePassword: identity.password,
          keyAlias: identity.alias,
        },
      },
    },
    {
      pathname: '/mtls',
      config: {
        tls: {
          cert: identity.cert,
          key: identity.key,
          ca: identity.cert,
        },
      },
    },
  ];
  for (const { pathname, config } of cases) {
    const baseUrl = config.tls
      ? `https://127.0.0.1:${secureServer.address().port}`
      : `http://127.0.0.1:${server.address().port}`;
    const provider = await loadApiProvider(`${baseUrl}${pathname}`, {
      options: {
        config: { method: 'GET', maxRetries: 0, transformResponse: 'json.output', ...config },
      },
    });
    if (state === 'missing' && pathname === '/jks') {
      await assert.rejects(provider.callApi('fixture prompt'), (error) => {
        assert.match(error.message, /JKS certificate support requires the "jks-js" package/);
        assert.ok(error.message.includes('npm install promptfoo jks-js@^1.1.5'));
        assert.ok(error.message.includes('npm install -g promptfoo jks-js@^1.1.5'));
        return true;
      });
    } else {
      const result = await provider.callApi('fixture prompt');
      assert.equal(result.error, undefined);
      assert.equal(result.output, 'authenticated fixture');
    }
  }
  assert.deepEqual(
    requests,
    state === 'missing' ? ['/plain', '/pem', '/mtls'] : cases.map((c) => c.pathname),
  );
} finally {
  for (const listener of [server, secureServer]) {
    if (listener.listening) {
      listener.closeAllConnections();
      await new Promise((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
}

console.log(
  `JKS ${format} ${state}: ordinary HTTP, PEM signing/mTLS, and JKS signing checks passed`,
);
