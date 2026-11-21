import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const cli = path.join(root, 'dist/src/main.js');
let outputDir: string;

describe('METEOR through the built CLI', () => {
  beforeAll(() => {
    expect(fs.existsSync(cli), 'Build the CLI before running smoke tests').toBe(true);
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-meteor-smoke-'));
  });

  afterAll(() => {
    if (outputDir) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('loads natural with native Node and reports positive and inverse scores', () => {
    const output = path.join(outputDir, 'results.json');
    const result = spawnSync(
      process.execPath,
      [
        cli,
        'eval',
        '-c',
        'test/smoke/fixtures/configs/meteor.yaml',
        '--no-cache',
        '--no-share',
        '-o',
        output,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: path.join(outputDir, 'config'),
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: '1',
        },
        timeout: 60_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(100);
    const rows = JSON.parse(fs.readFileSync(output, 'utf8')).results.results;
    expect(rows).toHaveLength(3);
    const [positive, inverseFailure, inversePass] = rows.toSorted(
      (left: { testIdx: number }, right: { testIdx: number }) => left.testIdx - right.testIdx,
    );
    expect(positive.success).toBe(true);
    expect(positive.score).toBeGreaterThan(0.9);
    expect(positive.error).toBeUndefined();
    expect(inverseFailure.success).toBe(false);
    expect(inverseFailure.score).toBeCloseTo(1 - positive.score, 12);
    expect(inverseFailure.gradingResult.reason).toMatch(
      /^METEOR score \d\.\d{4} met threshold 0\.9 \(expected it not to\)$/,
    );
    expect(inversePass.success).toBe(true);
    expect(inversePass.score).toBe(1);
    expect(inversePass.error).toBeUndefined();
  });
});
