import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');

describe('MCP Stdio Server', () => {
  let child: ChildProcess | undefined;
  let timeoutId: NodeJS.Timeout | undefined;
  let killTimeoutId: NodeJS.Timeout | undefined;

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
    if (killTimeoutId) {
      clearTimeout(killTimeoutId);
      killTimeoutId = undefined;
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
