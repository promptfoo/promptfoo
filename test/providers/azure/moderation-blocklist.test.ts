import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../../src/cache';
import { matchesModeration } from '../../../src/matchers/moderation';
import {
  AzureModerationProvider,
  parseAzureModerationResponse,
} from '../../../src/providers/azure/moderation';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/index')>()),
  fetchWithProxy: vi.fn(),
}));

const match = {
  blocklistName: 'company-terms',
  blocklistItemId: 'term-1',
  blocklistItemText: 'example term',
};
const flag = {
  code: 'blocklist:company-terms',
  description: 'Content matched blocklist item: example term',
  confidence: 1,
};

describe('Azure blocklist-only moderation', () => {
  beforeEach(() => {
    vi.mocked(fetchWithProxy).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('preserves blocklist matches when category analysis is empty', () => {
    const response = { categoriesAnalysis: [], blocklistsMatch: [match] };
    expect(parseAzureModerationResponse(response)).toEqual({ flags: [flag] });
    expect(response).toEqual({ categoriesAnalysis: [], blocklistsMatch: [match] });
  });

  it('preserves matches with the existing omitted-category compatibility shape', () => {
    expect(parseAzureModerationResponse({ blocklistsMatch: [match] })).toEqual({ flags: [flag] });
  });

  it('preserves multiple blocklist matches in response order', () => {
    const second = { ...match, blocklistName: 'other-terms' };
    expect(
      parseAzureModerationResponse({ categoriesAnalysis: [], blocklistsMatch: [match, second] }),
    ).toEqual({ flags: [flag, { ...flag, code: 'blocklist:other-terms' }] });
  });

  it.each([{ categoriesAnalysis: [] }, { categoriesAnalysis: [], blocklistsMatch: [] }, {}])(
    'keeps an empty response unflagged: %j',
    (response) => {
      expect(parseAzureModerationResponse(response)).toEqual({ flags: [] });
    },
  );

  it('keeps category flags before blocklist flags and preserves severity handling', () => {
    expect(
      parseAzureModerationResponse({
        categoriesAnalysis: [
          { category: 'Hate', severity: 4 },
          { category: 'Violence', severity: 0 },
        ],
        blocklistsMatch: [match],
      }),
    ).toEqual({
      flags: [{ code: 'hate', description: 'Content flagged for Hate', confidence: 4 / 7 }, flag],
    });
  });

  it.each([
    { name: 'default categories', categories: undefined, pass: false },
    { name: 'matching blocklist category', categories: ['blocklist:company-terms'], pass: false },
    { name: 'unrelated explicit category', categories: ['hate'], pass: true },
  ])('grades blocklist-only API responses with $name', async ({ categories, pass }) => {
    vi.mocked(fetchWithProxy).mockResolvedValue(
      Response.json({ categoriesAnalysis: [], blocklistsMatch: [match] }),
    );
    const provider = new AzureModerationProvider('text-content-safety', {
      config: {
        apiKey: 'test-key',
        endpoint: 'https://fixture.cognitiveservices.azure.com',
        blocklistNames: ['company-terms'],
        haltOnBlocklistHit: true,
      },
    });
    const result = await withCacheEnabled(false, () =>
      matchesModeration(
        { userPrompt: 'test', assistantResponse: 'example term', categories },
        { provider },
      ),
    );
    expect(result.pass).toBe(pass);
    expect(result.score).toBe(pass ? 1 : 0);
    expect(result.reason).toContain(pass ? 'No relevant moderation flags' : 'example term');
    expect(fetchWithProxy).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(fetchWithProxy).mock.calls[0];
    expect(url).toBe(
      'https://fixture.cognitiveservices.azure.com/contentsafety/text:analyze?api-version=2024-09-01',
    );
    expect(JSON.parse(options?.body as string)).toMatchObject({
      text: 'example term',
      blocklistNames: ['company-terms'],
      haltOnBlocklistHit: true,
    });
  });
});
