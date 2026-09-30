import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import { fetchWithProxy } from '../../../src/util/fetch/index';

import type { UnsafeBenchPlugin } from '../../../src/redteam/plugins/unsafebench';
import type { TestCase } from '../../../src/types/index';

vi.mock('../../../src/integrations/huggingfaceDatasets');
vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithProxy: vi.fn(),
}));

let Plugin: typeof UnsafeBenchPlugin;
const row = (image: string, safe = false, category = 'Violence'): TestCase => ({
  vars: { image, category, safety_label: safe ? 'safe' : 'unsafe' },
});

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  ({ UnsafeBenchPlugin: Plugin } = await import('../../../src/redteam/plugins/unsafebench'));
});
afterEach(() => vi.restoreAllMocks());

describe('UnsafeBench dataset loading', () => {
  it('keeps concurrent safe and unsafe dataset loads independent', async () => {
    let resolveUnsafe!: (rows: TestCase[]) => void;
    vi.mocked(fetchHuggingFaceDataset).mockImplementation(async (_path, limit) =>
      limit === 1000
        ? new Promise((resolve) => {
            resolveUnsafe = resolve;
          })
        : [row('mixed-unsafe'), row('mixed-safe', true)],
    );
    const unsafeRun = new Plugin({ type: 'test' }, 'purpose', 'image').generateTests(1);
    const mixedRun = new Plugin({ type: 'test' }, 'purpose', 'image', {
      includeSafe: true,
    }).generateTests(2);
    const mixed = await mixedRun;
    resolveUnsafe([row('unsafe-only')]);
    const unsafe = await unsafeRun;

    expect(mixed.map((test) => test.vars?.image).sort()).toEqual(['mixed-safe', 'mixed-unsafe']);
    expect(unsafe.map((test) => test.vars?.image)).toEqual(['unsafe-only']);
    expect(mixed.every((test) => test.assert?.[0].type === 'promptfoo:redteam:unsafebench')).toBe(
      true,
    );
    await new Plugin({ type: 'test' }, 'purpose', 'image', { includeSafe: true }).generateTests(2);
    expect(fetchHuggingFaceDataset).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(fetchHuggingFaceDataset).mock.calls) {
      expect(call[2]).toEqual({ cache: false });
    }
  });

  it('balances within each category', async () => {
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue([
      row('violence-unsafe'),
      row('violence-safe', true),
      row('hate-unsafe', false, 'Hate'),
      row('hate-safe', true, 'Hate'),
    ]);
    const tests = await new Plugin({ type: 'test' }, 'purpose', 'image', {
      includeSafe: true,
      categories: ['Violence', 'Hate'],
    }).generateTests(2);
    for (const category of ['Violence', 'Hate']) {
      expect(
        tests
          .filter((test) => test.metadata?.category === category)
          .map((test) => test.metadata?.label)
          .sort(),
      ).toEqual(['safe', 'unsafe']);
    }
  });

  it('downloads only selected images and applies each request size limit', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 4, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => row(`https://images.invalid/${index}`)),
    );
    vi.mocked(fetchWithProxy).mockImplementation(async () => new Response(png));
    for (const longest_edge of [2, 4]) {
      const tests = await new Plugin({ type: 'test' }, 'purpose', 'image', {
        longest_edge,
      }).generateTests(1);
      expect(tests).toHaveLength(1);
      const image = Buffer.from(String(tests[0].vars?.image).split(',')[1], 'base64');
      expect((await sharp(image).metadata()).width).toBe(longest_edge);
    }
    expect(fetchHuggingFaceDataset).toHaveBeenCalledTimes(2);
    expect(fetchWithProxy).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    'replaces failed downloads within category and safety quotas (includeSafe=%s)',
    async (includeSafe) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const sharp = (await import('sharp')).default;
      const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } })
        .png()
        .toBuffer();
      vi.mocked(fetchHuggingFaceDataset).mockResolvedValue(
        ['Violence', 'Hate'].flatMap((category) =>
          [false, true].flatMap((safe) =>
            ['broken', 'first', 'second'].map((suffix) =>
              row(`https://images.invalid/${category}-${safe}-${suffix}`, safe, category),
            ),
          ),
        ),
      );
      let active = 0;
      let maximumActive = 0;
      vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active--;
        return String(url).endsWith('broken')
          ? new Response(null, { status: 404 })
          : new Response(png);
      });
      const tests = await new Plugin({ type: 'test' }, 'purpose', 'image', {
        includeSafe,
        categories: ['Violence', 'Hate'],
      }).generateTests(2);
      expect(tests).toHaveLength(4);
      for (const category of ['Violence', 'Hate']) {
        const group = tests.filter((test) => test.metadata?.category === category);
        expect(group).toHaveLength(2);
        expect(group.filter((test) => test.metadata?.isSafe)).toHaveLength(includeSafe ? 1 : 0);
      }
      const urls = vi.mocked(fetchWithProxy).mock.calls.map((call) => String(call[0]));
      expect(new Set(urls).size).toBe(urls.length);
      expect(maximumActive).toBeLessThanOrEqual(4);
    },
  );

  it('retries a failed metadata load', async () => {
    vi.mocked(fetchHuggingFaceDataset)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([row('recovered')]);
    const plugin = new Plugin({ type: 'test' }, 'purpose', 'image');
    expect(await plugin.generateTests(1)).toEqual([]);
    expect(await plugin.generateTests(1)).toHaveLength(1);
    expect(fetchHuggingFaceDataset).toHaveBeenCalledTimes(2);
  });

  it('rejects nonboolean safe-control configuration', () => {
    expect(
      () =>
        new Plugin({ type: 'test' }, 'purpose', 'image', {
          includeSafe: 'false' as unknown as boolean,
        }),
    ).toThrow('includeSafe must be a boolean');
  });
});
