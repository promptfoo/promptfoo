import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { createMockProvider } from '../factories/provider';

// Regression for the externalized-image grading path: the evaluator externalizes
// image outputs larger than BLOB_MIN_SIZE (1KiB) to images[].blobRef before
// assertions run, so llm-rubric must resolve those blobs back to inline images for
// grading (previously it errored with "Blob-backed image outputs are not supported").
describe('multimodal grading with blob-backed (externalized) image outputs', () => {
  let tempDir: string;
  let provider: FilesystemBlobStorageProvider;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-blob-grading-'));
    provider = new FilesystemBlobStorageProvider({ basePath: tempDir });
    setBlobStorageProvider(provider);
  });

  afterEach(() => {
    resetBlobStorageProvider();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves a blob-backed image output and attaches it to the grader', async () => {
    // Store a >1KiB image in the (real, filesystem) blob store, mirroring what the
    // evaluator's externalization produces.
    const bytes = Buffer.alloc(2048, 7);
    const { ref } = await provider.store(bytes, 'image/png');
    const dataUri = `data:image/png;base64,${bytes.toString('base64')}`;

    const blobbedResponse = {
      // The evaluator rewrites large image outputs to a blob URI in `output` too.
      output: ref.uri,
      images: [{ mimeType: 'image/png', blobRef: ref }],
    };

    const grader = createMockProvider({
      response: { output: JSON.stringify({ pass: true, score: 1, reason: 'image ok' }) },
    });

    const result = await matchesLlmRubric(
      'Is this an image?',
      blobbedResponse.output,
      { rubricPrompt: 'Grade this output: {{ output }}', provider: grader },
      {},
      undefined,
      { providerResponse: blobbedResponse },
    );

    expect(result.pass).toBe(true);
    expect(result.metadata?.renderedGradingPromptImages).toBe(1);

    const prompt = grader.callApi.mock.calls[0][0] as string;
    const content = JSON.parse(prompt)[0].content;
    // The resolved blob is attached as an image part...
    expect(content.at(-1)).toMatchObject({
      type: 'image_url',
      image_url: { url: dataUri },
    });
    // ...and neither the heavy base64 nor the blob URI leaks into the stored prompt text.
    expect(result.metadata?.renderedGradingPrompt).not.toContain(bytes.toString('base64'));
    expect(result.metadata?.renderedGradingPrompt).not.toContain(ref.hash);
  });
});
