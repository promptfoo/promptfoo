import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ROOT_DIR = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.resolve(__dirname, 'fixtures/configs/not-script-assertions.yaml');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-not-script-assertions');

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

function expectComponentResult(
  result: {
    success: boolean;
    score: number;
    gradingResult: {
      componentResults: Array<{
        pass: boolean;
        score: number;
        reason: string;
      }>;
    };
  },
  expectedScore: number,
) {
  expect(result.success).toBe(true);
  expect(result.score).toBeCloseTo(expectedScore, 10);
  expect(result.gradingResult.componentResults).toHaveLength(1);
  expect(result.gradingResult.componentResults[0]).toMatchObject({
    pass: true,
    score: expectedScore,
    reason: 'Assertion passed',
  });
}

describe('Negated script assertion smoke tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  });

  it('inverts not-javascript, not-python, and not-ruby assertions through the built CLI', () => {
    const outputPath = path.join(OUTPUT_DIR, 'not-script-assertions-output.json');

    const { exitCode, stderr } = runCli([
      'eval',
      '-c',
      CONFIG_PATH,
      '-o',
      outputPath,
      '--no-cache',
    ]);

    expect(stderr).toBe('');
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const results = parsed.results.results;

    expect(results).toHaveLength(3);
    expectComponentResult(results[0], 1);
    expectComponentResult(results[1], 0.25);
    expectComponentResult(results[2], 0.4);
  });
});
