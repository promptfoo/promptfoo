import './setup';

import { randomUUID } from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

// End-to-end regression for the externalize -> grade path that originally broke:
// the evaluator externalizes a large inline image output to a blobRef BEFORE assertions
// run, and llm-rubric must resolve that blob (via the resolver the evaluator registers)
// to grade it — without persisting the base64.
describeEvaluator('multimodal grading externalization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-eval-blob-'));
    setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: tempDir }));
  });

  afterEach(() => {
    resetBlobStorageProvider();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('externalizes a large image output and resolves it for grading without persisting base64', async () => {
    // >1KiB so the evaluator externalizes it to images[].blobRef before assertions run.
    const base64 = Buffer.alloc(2048, 7).toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    const imageTarget: ApiProvider = {
      id: () => 'image-target',
      callApi: async () => ({ output: dataUri, images: [{ data: dataUri, mimeType: 'image/png' }] }),
    };

    const grader: ApiProvider = {
      id: () => 'test-image-grader',
      callApi: vi.fn(async () => ({
        output: JSON.stringify({ pass: true, score: 1, reason: 'looks like an image' }),
      })),
    };

    const testSuite: TestSuite = {
      providers: [imageTarget],
      prompts: [toPrompt('draw something')],
      defaultTest: {
        options: { provider: grader },
        assert: [{ type: 'llm-rubric', value: 'The output is an image.' }],
      },
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);

    const result = summary.results[0];

    // The evaluator externalized the image: blobRef set, inline data dropped, output rewritten.
    const image = result.response?.images?.[0];
    expect(image?.blobRef?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(image?.data).toBeUndefined();
    expect(result.response?.output).toMatch(/^promptfoo:\/\/blob\/[a-f0-9]{64}$/);

    // The heavy base64 is not persisted anywhere on the stored response.
    expect(JSON.stringify(result.response)).not.toContain(base64);

    // The blob was resolved and attached to the grader; the prompt text uses the placeholder.
    const grade =
      result.gradingResult?.componentResults?.find((c) => c.assertion?.type === 'llm-rubric') ??
      result.gradingResult;
    expect(grade?.metadata?.renderedGradingPromptImages).toBe(1);
    const renderedPrompt = String(grade?.metadata?.renderedGradingPrompt ?? '');
    expect(renderedPrompt).toContain('[Image output attached.');
    expect(renderedPrompt).not.toContain(base64);
    expect(renderedPrompt).not.toContain(image?.blobRef?.hash);

    // The grader actually received the resolved inline image (not the blob URI).
    const graderPrompt = vi.mocked(grader.callApi).mock.calls[0][0] as string;
    expect(graderPrompt).toContain(dataUri);
  });
});
