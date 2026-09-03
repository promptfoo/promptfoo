import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '../..');
const configPath = path.join(__dirname, 'fixtures/configs/trajectory-step-status.cjs');
let outputDir: string;
let port: number;

beforeAll(async () => {
  outputDir = mkdtempSync(path.join(tmpdir(), 'promptfoo-step-status-'));
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

describe('trajectory step status CLI', () => {
  it('grades persisted OTLP statuses, negation, and messages through the built CLI', () => {
    const outputPath = path.join(outputDir, 'results.json');
    const result = spawnSync(
      process.execPath,
      [
        path.join(rootDir, 'dist/src/main.js'),
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--max-concurrency',
        '1',
      ],
      {
        cwd: rootDir,
        encoding: 'utf8',
        timeout: 25_000,
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: path.join(outputDir, 'config'),
          PROMPTFOO_SMOKE_OTLP_PORT: String(port),
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          NO_COLOR: '1',
        },
      },
    );

    expect(result.error, result.stderr).toBeUndefined();
    // One case deliberately violates an inverse assertion; it must fail the CLI run.
    expect(result.status, result.stdout + result.stderr).toBe(100);
    const rows = JSON.parse(readFileSync(outputPath, 'utf8')).results.results;
    expect(rows.map((row: { success: boolean }) => row.success)).toEqual([true, true, false, true]);
    for (const row of rows) {
      expect(row.response.error).toBeUndefined();
      expect(row.gradingResult.score).toBe(row.success ? 1 : 0);
    }
    expect(rows[2].gradingResult.componentResults[0]).toMatchObject({
      pass: false,
      score: 0,
      reason: 'Trajectory step "search_orders" matched forbidden status error',
      assertion: { type: 'not-trajectory:step-status' },
    });
  });
});
