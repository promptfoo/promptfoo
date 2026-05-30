import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateSignalFile } from '../../src/database/signal';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';

import type { EvaluateResult } from '../../src/types/index';

vi.mock('../../src/database/signal', () => ({
  updateSignalFile: vi.fn(),
}));

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
    const csvPath = path.join(tempDir, 'results.csv');

    const writers = nodeEvaluatorRuntime.createResultWriters([jsonlPath, csvPath]);

    expect(writers).toHaveLength(1);
    await writers[0].write({ output: 'hello' });
    await writers[0].close();
    expect(fs.readFileSync(jsonlPath, 'utf8')).toBe('{"output":"hello"}\n');
  });

  it('delegates result persistence and resume checkpoint updates', async () => {
    const result = { success: true } as EvaluateResult;
    const addResult = vi.fn().mockResolvedValue(undefined);

    await nodeEvaluatorRuntime.persistResult({ addResult }, result);
    nodeEvaluatorRuntime.updateResumeSignal('eval-123');

    expect(addResult).toHaveBeenCalledWith(result);
    expect(updateSignalFile).toHaveBeenCalledWith('eval-123');
  });
});
