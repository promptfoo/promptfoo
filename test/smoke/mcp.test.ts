import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/entrypoint.js');

describe('MCP Command Stdio Transport', () => {
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
    }
    if (child) {
      child.removeAllListeners();
      if (child.exitCode === null) {
        child.kill('SIGINT');
        // Fallback to SIGKILL after 2 seconds if still running
        const killTimeout = setTimeout(() => {
          if (child?.exitCode === null) {
            child.kill('SIGKILL');
          }
        }, 2000);
        killTimeout.unref();
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
    const responsePromise = new Promise<void>((resolve, reject) => {
      child?.stdout?.on('data', (data) => {
        stdoutData += data.toString();
        if (stdoutData.includes('jsonrpc')) {
          resolve();
        }
      });

      child?.on('exit', (code) => {
        // Only reject if it's an unexpected non-zero exit code
        if (code !== null && code !== 0 && code !== 130) {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      timeoutId = setTimeout(() => reject(new Error('Timeout waiting for MCP response')), 15000);
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

    await expect(responsePromise).resolves.toBeUndefined();

    const response = JSON.parse(stdoutData.trim());
    expect(response.id).toBe(1);
    expect(response.result.serverInfo.name).toBe('Promptfoo MCP');
  });
});
