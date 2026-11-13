import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('OpenAI Agents tool metadata through the CLI', () => {
  it('scores actual SDK calls independently of identical final-answer text', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-agent-tools-'));
    const output = path.join(tempDir, 'results.json');
    const run = spawnSync(
      process.execPath,
      [
        path.join(root, 'dist/src/main.js'),
        'eval',
        '-c',
        'test/smoke/fixtures/configs/openai-agents-tool-calls.yaml',
        '--no-cache',
        '--no-table',
        '-o',
        output,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: tempDir,
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          OPENAI_AGENTS_DISABLE_TRACING: '1',
        },
      },
    );
    expect(run.error).toBeUndefined();
    expect(run.status, run.stdout + run.stderr).toBe(100);
    const results = JSON.parse(fs.readFileSync(output, 'utf8')).results.results;
    const called = results.find((result: { testIdx: number }) => result.testIdx === 0);
    const mentioned = results.find((result: { testIdx: number }) => result.testIdx === 1);
    expect(called.success).toBe(true);
    expect(called.error).toBeUndefined();
    expect(mentioned.success).toBe(false);
    expect(called.response.output).toBe(mentioned.response.output);
    expect(called.response.metadata.toolCallsComplete).toBe(true);
    expect(mentioned.response.metadata.toolCallsComplete).toBe(true);
    expect(called.response.metadata.toolCalls).toMatchObject([
      { name: 'lookup_order', resultPresent: true },
    ]);
    expect(mentioned.response.metadata.toolCalls).toEqual([]);
    expect(
      mentioned.gradingResult.componentResults.map((grade: { pass: boolean }) => grade.pass),
    ).toEqual([true, false, false]);
  });
});
