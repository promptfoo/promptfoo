import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion, runAssertions } from '../../src/assertions';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { createMockProvider } from '../factories/provider';

const hash = 'a'.repeat(64);
const blobRef = {
  hash,
  uri: `promptfoo://blob/${hash}`,
  mimeType: 'image/jpeg',
  sizeBytes: 3,
  provider: 'fixture',
};

function createGrader() {
  return createMockProvider({
    response: { output: JSON.stringify({ pass: true, score: 1, reason: 'image received' }) },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('blob-backed image grading', () => {
  it.each(['reference', 'uri'] as const)(
    'normalizes an uppercase stored hash (%s)',
    async (mode) => {
      const upper = hash.toUpperCase();
      const resolveImageBlob = vi.fn(async () => ({ data: Buffer.from('abc') }));
      const image =
        mode === 'reference'
          ? { blobRef: { ...blobRef, hash: upper, uri: `promptfoo://blob/${upper}` } }
          : { data: `promptfoo://blob/${upper}` };
      const result = await matchesLlmRubric(
        'An image is attached.',
        image.blobRef?.uri ?? image.data!,
        { provider: createGrader() },
        {},
        undefined,
        {
          providerResponse: { images: [image] },
          resolveImageBlob,
        },
      );
      expect(result.pass).toBe(true);
      expect(resolveImageBlob).toHaveBeenCalledExactlyOnceWith(hash);
    },
  );

  it.each(['single', 'batch'] as const)(
    'keeps the explicit resolver without a target provider (%s)',
    async (mode) => {
      const grader = createGrader();
      const resolveImageBlob = vi.fn(async () => ({ data: Buffer.from('abc') }));
      const assertion = { type: 'llm-rubric' as const, value: 'An image is attached.' };
      const args = {
        test: { options: { provider: grader }, assert: [assertion] },
        providerResponse: { output: blobRef.uri, images: [{ blobRef }] },
        resolveImageBlob,
      };
      const result =
        mode === 'single' ? await runAssertion({ ...args, assertion }) : await runAssertions(args);

      expect(result.pass).toBe(true);
      expect(resolveImageBlob).toHaveBeenCalledExactlyOnceWith(hash);
      expect(grader.callApi.mock.calls[0][0]).toContain('data:image/jpeg;base64,YWJj');
    },
  );

  it.each([
    { imageMime: undefined, resolverMime: undefined, expected: 'image/jpeg' },
    { imageMime: undefined, resolverMime: 'image/webp', expected: 'image/webp' },
    { imageMime: 'image/png', resolverMime: 'image/webp', expected: 'image/webp' },
    { imageMime: 'image/png', resolverMime: undefined, expected: 'image/jpeg' },
  ])('uses the resolved image MIME: $expected', async ({ imageMime, resolverMime, expected }) => {
    const grader = createGrader();
    const result = await matchesLlmRubric(
      'An image is attached.',
      blobRef.uri,
      { provider: grader },
      {},
      undefined,
      {
        providerResponse: { output: blobRef.uri, images: [{ blobRef, mimeType: imageMime }] },
        resolveImageBlob: async () => ({ data: Buffer.from('abc'), mimeType: resolverMime }),
      },
    );

    expect(result.pass).toBe(true);
    expect(grader.callApi.mock.calls[0][0]).toContain(`data:${expected};base64,YWJj`);
    expect(result.metadata?.renderedGradingPrompt).not.toContain(hash);
  });
});
