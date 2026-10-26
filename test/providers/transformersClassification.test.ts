import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClassifier } from '../../src/assertions/classifier';
import { providerRegistry } from '../../src/providers/providerRegistry';
import {
  disposePipelines,
  TransformersTextClassificationProvider,
} from '../../src/providers/transformers';
import { createDeferred } from '../util/utils';

import type { AssertionParams } from '../../src/types/index';

const { pipeline, classify, dispose } = vi.hoisted(() => ({
  pipeline: vi.fn(),
  classify: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../../src/providers/transformersAvailability', () => ({
  loadTransformers: async () => ({ pipeline }),
}));
vi.mock('../../src/providers/providerRegistry', () => ({
  providerRegistry: {
    register: vi.fn(),
    useResource: vi.fn(),
    withProvider: (_provider: unknown, callback: () => Promise<unknown>) => callback(),
    throwIfResourceUseAborted: (signal?: AbortSignal) => signal?.throwIfAborted(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  classify.mockResolvedValue([
    { label: 'POSITIVE', score: 0.8 },
    { label: 'NEGATIVE', score: 0.2 },
  ]);
  dispose.mockResolvedValue(undefined);
  pipeline.mockResolvedValue(Object.assign(classify, { dispose }));
});

afterEach(async () => {
  await disposePipelines();
  vi.resetAllMocks();
});

describe('local text classification', () => {
  it('returns all labels so thresholds on a non-winning class remain meaningful', async () => {
    const provider = new TransformersTextClassificationProvider('fixture');
    expect(await provider.callClassificationApi('A mixed review.')).toEqual({
      classification: { POSITIVE: 0.8, NEGATIVE: 0.2 },
    });
    expect(pipeline).toHaveBeenCalledWith('text-classification', 'fixture', expect.any(Object));
    expect(classify).toHaveBeenCalledWith('A mixed review.', { top_k: null });
  });

  it('uses the existing classifier assertion, including non-winning labels', async () => {
    const provider = new TransformersTextClassificationProvider('fixture');
    const result = await handleClassifier({
      assertion: { type: 'classifier', value: 'NEGATIVE', threshold: 0.15 },
      renderedValue: 'NEGATIVE',
      outputString: 'A mixed review.',
      test: { options: { provider } },
      inverse: false,
    } as AssertionParams);
    expect(result).toMatchObject({ pass: true, score: 0.2 });
  });

  it('supports the target-provider API without losing classification scores', async () => {
    const provider = new TransformersTextClassificationProvider('fixture');
    const result = await provider.callApi('A review.');
    expect(JSON.parse(result.output as string)).toEqual({ POSITIVE: 0.8, NEGATIVE: 0.2 });
  });

  it('preserves independent multi-label probabilities without renormalizing', async () => {
    classify.mockResolvedValue([
      { label: 'toxic', score: 0.8 },
      { label: 'insult', score: 0.9 },
    ]);
    expect(
      await new TransformersTextClassificationProvider('fixture').callClassificationApi('text'),
    ).toEqual({ classification: { toxic: 0.8, insult: 0.9 } });
  });

  it.each(['', ' ', '\n'])('rejects empty input before model initialization: %j', async (text) => {
    expect(
      await new TransformersTextClassificationProvider('fixture').callClassificationApi(text),
    ).toMatchObject({ error: expect.any(String) });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it.each(
    [
      [],
      null,
      [{ label: '', score: 0.1 }],
      [{ label: 'A', score: NaN }],
      [{ label: 'A', score: Infinity }],
      [{ label: 'A', score: -0.1 }],
      [{ label: 'A', score: 1.1 }],
      [
        { label: 'A', score: 0.1 },
        { label: 'A', score: 0.9 },
      ],
      [[{ label: 'A', score: 1 }]],
    ].map((result) => ({ result })),
  )('rejects invalid SDK output without leaking raw data: $result', async ({ result }) => {
    classify.mockResolvedValue(result);
    const response = await new TransformersTextClassificationProvider(
      'fixture',
    ).callClassificationApi('private input');
    expect(response).toMatchObject({ error: expect.stringContaining('classifier returned') });
    expect(response.error).not.toContain('private input');
  });

  it('retains a model label named __proto__ as an own probability without changing the prototype', async () => {
    classify.mockResolvedValue([
      { label: '__proto__', score: 0.6 },
      { label: 'constructor', score: 0.4 },
    ]);
    const result = await new TransformersTextClassificationProvider(
      'fixture',
    ).callClassificationApi('text');
    expect(Object.hasOwn(result.classification!, '__proto__')).toBe(true);
    expect(result.classification!.__proto__).toBe(0.6);
    expect(Object.getPrototypeOf(result.classification)).toBe(Object.prototype);
  });

  it('does not invert a classifier failure into a passing negative assertion', async () => {
    classify.mockResolvedValue([]);
    const provider = new TransformersTextClassificationProvider('fixture');
    const result = await handleClassifier({
      assertion: { type: 'not-classifier', value: 'NEGATIVE', threshold: 0.15 },
      renderedValue: 'NEGATIVE',
      outputString: 'text',
      test: { options: { provider } },
      inverse: true,
    } as AssertionParams);
    expect(result).toMatchObject({ pass: false, metadata: { graderError: true } });
  });

  it('shares a model until both owners release it, then disposes once', async () => {
    const first = new TransformersTextClassificationProvider('fixture');
    const second = new TransformersTextClassificationProvider('fixture');
    await Promise.all([first.callClassificationApi('one'), second.callClassificationApi('two')]);
    expect(pipeline).toHaveBeenCalledTimes(1);
    await first.cleanup();
    expect(dispose).not.toHaveBeenCalled();
    await second.cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('can be reused after cleanup and retries failed initialization', async () => {
    pipeline.mockRejectedValueOnce(new Error('fixture model unavailable'));
    const provider = new TransformersTextClassificationProvider('fixture');
    expect(await provider.callClassificationApi('one')).toMatchObject({
      error: expect.any(String),
    });
    expect(await provider.callClassificationApi('two')).toMatchObject({
      classification: { POSITIVE: 0.8 },
    });
    await provider.cleanup();
    await provider.callClassificationApi('three');
    expect(pipeline).toHaveBeenCalledTimes(3);
  });

  it('does not begin inference after cancellation while waiting for resource access', async () => {
    const ready = createDeferred<void>();
    vi.mocked(providerRegistry.useResource).mockReturnValueOnce(ready.promise);
    const controller = new AbortController();
    const provider = new TransformersTextClassificationProvider('fixture');
    const result = provider.callClassificationApi('text', { abortSignal: controller.signal });
    controller.abort(new Error('fixture canceled'));
    ready.resolve();
    await expect(result).rejects.toThrow('fixture canceled');
    expect(classify).not.toHaveBeenCalled();
  });

  it('discards an inference result if its caller was canceled', async () => {
    const ready = createDeferred<unknown>();
    const started = createDeferred<void>();
    classify.mockImplementationOnce(() => {
      started.resolve();
      return ready.promise;
    });
    const controller = new AbortController();
    const provider = new TransformersTextClassificationProvider('fixture');
    const result = provider.callClassificationApi('text', { abortSignal: controller.signal });
    await started.promise;
    controller.abort(new Error('fixture canceled'));
    ready.resolve([{ label: 'POSITIVE', score: 1 }]);
    await expect(result).rejects.toThrow('fixture canceled');
  });
});
