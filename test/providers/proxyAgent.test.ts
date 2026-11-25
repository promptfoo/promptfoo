import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { type AddressInfo, createConnection } from 'node:net';
import type { Duplex } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { LiveSession } from '../../src/providers/openai/liveSession';
import { mockProcessEnv, PROXY_ENV_KEYS } from '../util/utils';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return (server.address() as AddressInfo).port;
}

describe('GPT-Live with a PAC proxy', () => {
  let pacServer: Server;
  let proxyServer: Server;
  let sockets: WebSocketServer;
  let restoreEnv: () => void;
  let pacUrl: string;
  let proxyPort: number;
  let pacSource: string;
  let pacReads: number;
  let upgrades: string[];
  let connects: string[];
  let tunnels: Set<Duplex>;

  beforeEach(async () => {
    restoreEnv = mockProcessEnv({
      ...Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])),
      npm_config_no_proxy: undefined,
    });
    pacReads = 0;
    upgrades = [];
    connects = [];
    tunnels = new Set();
    pacServer = createServer((_request, response) => {
      pacReads++;
      response.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
      response.end(pacSource);
    });
    proxyServer = createServer();
    proxyServer.on('connect', (request, socket, head) => {
      connects.push(request.url ?? '');
      // Route the deliberately unresolvable target to our local protocol fixture only.
      const upstream = createConnection({ host: '127.0.0.1', port: proxyPort });
      tunnels.add(socket);
      tunnels.add(upstream);
      upstream.once('connect', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        socket.pipe(upstream).pipe(socket);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.once('close', () => upstream.destroy());
    });
    sockets = new WebSocketServer({ noServer: true });
    proxyServer.on('upgrade', (request, socket, head) => {
      upgrades.push(request.url ?? '');
      sockets.handleUpgrade(request, socket, head, (ws) => {
        ws.on('message', (raw) => {
          const event = JSON.parse(raw.toString());
          const send = (value: object) => ws.send(JSON.stringify(value));
          if (event.type === 'session.start') {
            send({ type: 'session.started', session: { id: 'pac_fixture' } });
          } else if (event.type === 'session.instructions.append') {
            send({ type: 'session.instructions.appended', client_event_id: event.event_id });
          } else if (event.type === 'session.commentary.append') {
            send({ type: 'session.commentary.appended', client_event_id: event.event_id });
            send({
              type: 'session.output_transcript.delta',
              delta: 'PAC fixture ok',
              start_ms: 0,
              end_ms: 10,
            });
          } else if (event.type === 'session.close') {
            send({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 0.1 } });
          }
        });
      });
    });
    proxyPort = await listen(proxyServer);
    pacUrl = `pac+http://127.0.0.1:${await listen(pacServer)}/proxy.pac`;
    pacSource = `function FindProxyForURL(url, host) {
      var ip = dnsResolve('localhost');
      if (typeof process !== 'undefined' || typeof require !== 'undefined' ||
          !dnsDomainIs(host, '.fixture.invalid') || !isInNet(ip, '127.0.0.0', '255.0.0.0')) {
        throw new Error('Unexpected PAC environment');
      }
      return 'PROXY 127.0.0.1:${proxyPort}';
    }`;
  });

  afterEach(async () => {
    for (const socket of sockets.clients) {
      socket.terminate();
    }
    for (const tunnel of tunnels) {
      tunnel.destroy();
    }
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
    for (const server of [pacServer, proxyServer]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    restoreEnv();
  });

  const run = (url = 'ws://live.fixture.invalid/v1/live/sessions') =>
    new LiveSession({
      url,
      headers: { Authorization: 'Bearer fixture-key' },
      model: 'gpt-live-1',
      config: {},
      format: { type: 'audio/pcm', rate: 24000 },
      input: [],
      audio: Buffer.alloc(0),
      responseWindowMs: 20,
      maxAudioBytes: 1024,
      websocketTimeout: 5000,
      closeTimeoutMs: 1000,
      requestTimeoutMs: 10000,
      signal: new AbortController().signal,
    }).run();

  it('loads PAC and runs asynchronous helpers before proxying the actual WebSocket', async () => {
    mockProcessEnv({ HTTP_PROXY: pacUrl });
    const response = await run();
    expect(response.error).toBeUndefined();
    expect(response.output).toBe('PAC fixture ok');
    expect(pacReads).toBeGreaterThan(0);
    expect(connects).toEqual(['live.fixture.invalid:80']);
    expect(upgrades).toEqual(['/v1/live/sessions']);
  });

  it('reports PAC errors without silently connecting directly', async () => {
    pacSource = "function FindProxyForURL() { throw new Error('private PAC detail'); }";
    mockProcessEnv({ HTTP_PROXY: pacUrl });
    const response = await run();
    expect(response.error).toContain('WebSocket connection failed');
    expect(response.error).not.toContain('private PAC detail');
    expect(pacReads).toBeGreaterThan(0);
    expect(upgrades).toEqual([]);
    expect(connects).toEqual([]);
  });

  it('honors NO_PROXY without fetching or executing the PAC file', async () => {
    mockProcessEnv({ HTTP_PROXY: pacUrl, NO_PROXY: '127.0.0.1' });
    const response = await run(`ws://127.0.0.1:${proxyPort}/v1/live/sessions`);
    expect(response.error).toBeUndefined();
    expect(response.output).toBe('PAC fixture ok');
    expect(pacReads).toBe(0);
    expect(connects).toEqual([]);
    expect(upgrades).toEqual(['/v1/live/sessions']);
  });
});

it('bounds malformed FTP directory listing parsing in the installed PAC dependency chain', () => {
  // Keep the vulnerable parser in a child so a dependency regression cannot hang the test worker.
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const { createRequire } = require('node:module');
       let load = require;
       for (const name of ['proxy-agent', 'pac-proxy-agent', 'get-uri']) {
         load = createRequire(load.resolve(name));
       }
       const { parseList } = load('basic-ftp');
       const bad = '-rw-r--r--r-- 1 ' + 'a '.repeat(100000) + '!';
       const good = '-rw-r--r-- 1 owner group 12 Jan 01 2024 proxy.pac';
       const files = parseList(bad + '\\r\\n' + good);
       if (files.length !== 1 || files[0].name !== 'proxy.pac') process.exit(1);`,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
});
