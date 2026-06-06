import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../src/models/eval';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';

import type { EvaluateResult } from '../../src/types/index';

describe('nodeEvaluatorRuntime', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.clearAllMocks();
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates and closes JSONL writers for JSONL output paths only', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-evaluator-runtime-'));
    tempDirs.push(tempDir);
    const jsonlPath = path.join(tempDir, 'results.jsonl');
    const uppercaseJsonlPath = path.join(tempDir, 'uppercase.JSONL');
    const csvPath = path.join(tempDir, 'results.csv');

    const writers = nodeEvaluatorRuntime.createResultWriters(
      [jsonlPath, uppercaseJsonlPath, csvPath],
      { append: false },
    );

    expect(writers).toHaveLength(2);
    await writers[0].write({ output: 'hello' });
    await writers[1].write({ output: 'uppercase' });
    await writers[0].close();
    await writers[1].close();
    expect(fs.readFileSync(jsonlPath, 'utf8')).toBe('{"output":"hello"}\n');
    expect(fs.readFileSync(uppercaseJsonlPath, 'utf8')).toBe('{"output":"uppercase"}\n');
  });

  it('truncates by default and appends when resuming', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-evaluator-runtime-'));
    tempDirs.push(tempDir);
    const jsonlPath = path.join(tempDir, 'results.jsonl');

    fs.writeFileSync(jsonlPath, 'stale row\n');
    const [writer] = nodeEvaluatorRuntime.createResultWriters(jsonlPath, { append: false });
    await writer.write({ output: 'fresh' });
    await writer.close();
    expect(fs.readFileSync(jsonlPath, 'utf8')).toBe('{"output":"fresh"}\n');

    const [appender] = nodeEvaluatorRuntime.createResultWriters(jsonlPath, { append: true });
    await appender.write({ output: 'resumed' });
    await appender.close();
    expect(fs.readFileSync(jsonlPath, 'utf8')).toBe('{"output":"fresh"}\n{"output":"resumed"}\n');
  });

  it('creates an Eval-backed evaluation store', async () => {
    const result = { success: true } as EvaluateResult;
    const evaluation = new Eval({});
    const addResult = vi.spyOn(evaluation, 'addResult').mockResolvedValue(undefined);
    const store = nodeEvaluatorRuntime.createEvaluationStore(evaluation);

    await store.appendResult(result);

    expect(store.evaluation).toBe(evaluation);
    expect(addResult).toHaveBeenCalledWith(result);
  });
});
