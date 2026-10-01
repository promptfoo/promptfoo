import './setup';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'crypto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as blobs from '../../src/blobs';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('multimodal grading externalization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-eval-blob-'));
    setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: tempDir }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetBlobStorageProvider();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each([false, true])(
    'checks current-eval image authorization before reading (allowed=%s)',
    async (allowed) => {
      const hash = 'c'.repeat(64);
      const authorize = vi.spyOn(blobs, 'isBlobAllowedForShare').mockResolvedValue(allowed);
      const read = vi.spyOn(blobs, 'getBlobByHash').mockResolvedValue({
        data: Buffer.from('abc'),
        metadata: { mimeType: 'image/png' },
      } as Awaited<ReturnType<typeof blobs.getBlobByHash>>);
      const grader: ApiProvider = {
        id: () => 'test-image-grader',
        callApi: vi.fn(async () => ({ output: '{"pass":true,"score":1}' })),
      };
      const suite: TestSuite = {
        providers: [
          {
            id: () => 'image-target',
            callApi: async () => ({
              output: 'Stored image',
              images: [
                {
                  blobRef: {
                    hash,
                    uri: `promptfoo://blob/${hash}`,
                    mimeType: 'image/png',
                    sizeBytes: 3,
                    provider: 'fixture',
                  },
                },
              ],
            }),
          },
        ],
        prompts: [toPrompt('Describe the image')],
        defaultTest: {
          options: { provider: grader },
          assert: [{ type: 'llm-rubric', value: 'An image is attached.' }],
        },
        tests: [{}],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await evaluate(suite, record, {});
      const summary = await record.toEvaluateSummary();
      expect(authorize).toHaveBeenCalledExactlyOnceWith(hash, record.id);
      expect(read).toHaveBeenCalledTimes(allowed ? 1 : 0);
      expect(grader.callApi).toHaveBeenCalledTimes(allowed ? 1 : 0);
      expect(summary.stats.successes).toBe(allowed ? 1 : 0);
      if (!allowed) {
        expect(summary.results[0].error).toContain('Failed to load blob-backed image');
      }
    },
  );

  it.each([1, 2])(
    'externalizes %i images and resolves them without persisting base64',
    async (count) => {
      // >1KiB so the evaluator externalizes it to images[].blobRef before assertions run.
      const base64 = Buffer.alloc(2048, 7).toString('base64');
      const images = Array.from({ length: count }, (_, index) => ({
        data: `data:image/png;base64,${Buffer.alloc(2048, 7 + index).toString('base64')}`,
        mimeType: 'image/png',
      }));
      const dataUri = images[0].data;

      const imageTarget: ApiProvider = {
        id: () => 'image-target',
        callApi: async () => ({
          output:
            count === 1
              ? dataUri
              : JSON.stringify({
                  data: images.map(({ data }) => ({ b64_json: data.split(',')[1] })),
                }),
          images,
        }),
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
      const storedUris =
        count === 1 ? [result.response?.output] : JSON.parse(String(result.response?.output));
      expect(storedUris).toHaveLength(count);
      expect(
        storedUris.every((uri: string) => /^promptfoo:\/\/blob\/[a-f0-9]{64}$/.test(uri)),
      ).toBe(true);

      // Image bytes stay out of the saved response.
      expect(JSON.stringify(result.response)).not.toContain(base64);

      // The blob was resolved and attached to the grader; the prompt text uses the placeholder.
      const grade =
        result.gradingResult?.componentResults?.find((c) => c.assertion?.type === 'llm-rubric') ??
        result.gradingResult;
      expect(grade?.metadata?.renderedGradingPromptImages).toBe(count);
      const renderedPrompt = String(grade?.metadata?.renderedGradingPrompt ?? '');
      expect(renderedPrompt).toContain('[Image output attached.');
      expect(renderedPrompt).not.toContain(base64);
      expect(renderedPrompt).not.toContain(image?.blobRef?.hash);

      // The grader actually received the resolved inline image (not the blob URI).
      const graderPrompt = vi.mocked(grader.callApi).mock.calls[0][0] as string;
      for (const image of images) {
        expect(graderPrompt).toContain(image.data);
      }
    },
  );
});
