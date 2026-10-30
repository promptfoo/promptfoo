import { createServer } from 'node:http';
import os from 'node:os';
import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');

describe('MCP Stdio Server', () => {
  let child: ChildProcess | undefined;
  let timeoutId: NodeJS.Timeout | undefined;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
  });

  afterEach(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (child) {
      child.removeAllListeners();
      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
      child = undefined;
    }
  });

  it('should stay alive and respond to initialize request', async () => {
    child = spawn('node', [CLI_PATH, 'mcp', '--transport', 'stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: 'true' },
    });

    let stdoutData = '';
    let stderrData = '';
    let hasExited = false;

    const responsePromise = new Promise<string>((resolve, reject) => {
      child?.stdout?.on('data', (data) => {
        stdoutData += data.toString();
        // Look for a complete JSON-RPC response
        if (stdoutData.includes('"jsonrpc"') && stdoutData.includes('"result"')) {
          resolve(stdoutData);
        }
      });

      child?.stderr?.on('data', (data) => {
        stderrData += data.toString();
      });

      child?.on('exit', (code) => {
        hasExited = true;
        // Reject if process exits before we get a response
        if (!stdoutData.includes('"jsonrpc"')) {
          reject(
            new Error(
              `Process exited with code ${code} before sending response. stderr: ${stderrData}`,
            ),
          );
        }
      });

      timeoutId = setTimeout(
        () => reject(new Error(`Timeout waiting for MCP response. stderr: ${stderrData}`)),
        15000,
      );
    });

    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    child.stdin?.write(JSON.stringify(initRequest) + '\n');

    const responseData = await responsePromise;

    // Parse the JSON response (handle potential extra whitespace/newlines)
    let response;
    try {
      response = JSON.parse(responseData.trim());
    } catch {
      // Try to extract JSON from the response if there's extra content
      const jsonMatch = responseData.match(/\{[\s\S]*"jsonrpc"[\s\S]*\}/);
      if (jsonMatch) {
        response = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse JSON response: ${responseData}`);
      }
    }

    expect(response.id).toBe(1);
    expect(response.result.serverInfo.name).toBe('Promptfoo MCP');

    // Verify process is still alive after responding
    expect(hasExited).toBe(false);
    expect(child?.exitCode).toBeNull();
  });

  it('should shutdown gracefully on SIGINT', async () => {
    child = spawn('node', [CLI_PATH, 'mcp', '--transport', 'stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: 'true' },
    });

    let stdoutData = '';

    // Wait for server to be ready by sending initialize request and waiting for response
    const readyPromise = new Promise<void>((resolve, reject) => {
      child?.stdout?.on('data', (data) => {
        stdoutData += data.toString();
        if (stdoutData.includes('"jsonrpc"') && stdoutData.includes('"result"')) {
          resolve();
        }
      });

      child?.on('exit', (code) => {
        if (!stdoutData.includes('"jsonrpc"')) {
          reject(new Error(`Process exited with code ${code} before responding`));
        }
      });

      timeoutId = setTimeout(() => reject(new Error('Timeout waiting for server ready')), 10000);
    });

    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    child.stdin?.write(JSON.stringify(initRequest) + '\n');
    await readyPromise;

    // Clear the previous timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    // Verify process is still running
    expect(child.exitCode).toBeNull();

    // Send SIGINT and wait for graceful shutdown
    const exitPromise = new Promise<number | null>((resolve, reject) => {
      child?.on('exit', (code) => resolve(code));
      timeoutId = setTimeout(() => reject(new Error('Timeout waiting for process exit')), 10000);
    });

    child.kill('SIGINT');

    const exitCode = await exitPromise;

    // Process should exit cleanly (0) or with signal termination (null or 130 for SIGINT)
    // The key test is that it exits at all rather than hanging
    expect(exitCode === 0 || exitCode === null || exitCode === 130).toBe(true);
  });
});

describe('MCP HTTP Server', () => {
  it('handles malformed JSON without losing the initialized session or logging its body', async () => {
    expect(fs.existsSync(CLI_PATH), 'Build the CLI before running smoke tests').toBe(true);
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-http-'));
    const reservation = createServer();
    await new Promise<void>((resolve, reject) => {
      reservation.once('error', reject);
      reservation.listen(0, '127.0.0.1', resolve);
    });
    const address = reservation.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing reserved HTTP port');
    }
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
    const child = spawn(
      process.execPath,
      [CLI_PATH, 'mcp', '--transport', 'http', '--port', String(port)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NO_COLOR: '1',
          LOG_LEVEL: 'info',
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_DISABLE_TELEMETRY: 'true',
          PROMPTFOO_DISABLE_UPDATE: 'true',
          PROMPTFOO_DISABLE_SHARING: 'true',
          PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        },
      },
    );
    let output = '';
    let closed = false;
    const close = new Promise<void>((resolve) =>
      child.once('close', () => {
        closed = true;
        resolve();
      }),
    );
    const canary = 'mcp-malformed-body-canary';
    const endpoint = `http://127.0.0.1:${port}`;
    let sessionId: string | null = null;
    let readyTimer: NodeJS.Timeout | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      const collect = (data: Buffer) => {
        output += data.toString();
        if (output.includes(`Promptfoo MCP server running at http://localhost:${port}`)) {
          clearTimeout(readyTimer);
          resolve();
        }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.once('error', reject);
      child.once('exit', () => reject(new Error(`MCP exited before readiness: ${output}`)));
      readyTimer = setTimeout(() => reject(new Error(`MCP startup timed out: ${output}`)), 10000);
    });
    const post = (body: unknown, raw = false) =>
      fetch(`${endpoint}/mcp`, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
          ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
        },
        body: raw ? String(body) : JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
    const messages = async (response: Response) => {
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      return (await response.text())
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6)));
    };
    try {
      await ready;
      const initialized = await post({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'http-smoke-test', version: '1.0.0' },
        },
      });
      expect(initialized.status).toBe(200);
      expect(await messages(initialized)).toMatchObject([
        { id: 0, result: { serverInfo: { name: 'Promptfoo MCP' } } },
      ]);
      sessionId = initialized.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
      const notified = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(notified.status).toBe(202);
      await notified.text();
      const malformed = await post(
        `{"payloadNote":"${canary}","padding":"${'x'.repeat(512)}","broken":}`,
        true,
      );
      expect(malformed.status).toBe(400);
      expect(malformed.headers.get('content-type')).toContain('application/json');
      expect(await malformed.json()).toEqual({ error: 'Bad Request' });
      const recovered = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      expect(recovered.status).toBe(200);
      const [response] = await messages(recovered);
      expect(response.id).toBe(1);
      expect(response.result.tools.length).toBeGreaterThan(0);
      const health = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(3000) });
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: 'OK' });
    } finally {
      clearTimeout(readyTimer);
      if (!closed) {
        child.kill('SIGTERM');
        const killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
        try {
          await close;
        } finally {
          clearTimeout(killTimer);
        }
      }
      fs.rmSync(configDir, { recursive: true, force: true });
    }
    // 'close' waits for both pipes, including deferred Express/logger output.
    expect(output).toContain('SyntaxError');
    expect(output).not.toContain(canary);
  });
});
