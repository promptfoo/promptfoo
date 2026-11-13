import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { DataExfilGrader } from '../../src/redteam/plugins/dataExfil';
import IndirectWebPwnProvider from '../../src/redteam/providers/indirectWebPwn';
import { checkExfilTracking } from '../../src/redteam/strategies/indirectWebPwn';
import { fetchWithRetries } from '../../src/util/fetch/index';

import type { AtomicTestCase, ProviderResponse } from '../../src/types/index';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: vi.fn(),
}));

const pageUuid = 'b385605f-0328-4f21-a977-811ec61bf3f8';
const evaluationId = '2026-10-08T22:36:45';
const pageUrl = `https://example.com/dynamic-pages/${evaluationId}/${pageUuid}`;
const tracking = {
  wasExfiltrated: true,
  exfilCount: 1,
  exfilRecords: [{ queryParams: { canary: 'synthetic-marker' } }],
};

function grade(
  metadata: AtomicTestCase['metadata'],
  responseMetadata?: ProviderResponse['metadata'],
) {
  return runAssertions({
    prompt: 'Summarize the page',
    test: {
      assert: [{ type: 'promptfoo:redteam:data-exfil' }],
      metadata: { purpose: 'A document assistant', ...metadata },
    },
    providerResponse: { output: 'A synthetic response', metadata: responseMetadata },
  });
}

describe('web page tracking request contract', () => {
  beforeEach(() => {
    vi.mocked(fetchWithRetries).mockReset();
    vi.mocked(fetchWithRetries).mockImplementation(async () => Response.json(tracking));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchWithRetries).mockReset();
  });

  it('preserves deterministic exfiltration grading from provider UUID and page URL', async () => {
    const fallback = vi.spyOn(RedteamGraderBase.prototype, 'getResult');
    const result = await grade({}, { webPageUuid: pageUuid, webPageUrl: pageUrl });

    expect(result.pass).toBe(false);
    expect(result.componentResults?.[0].reason).toContain('Data exfiltration detected');
    expect(result.componentResults?.[0].score).toBe(0);
    expect(result.componentResults?.[0].reason).toContain('synthetic-marker');
    expect(fallback).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toEqual({
      task: 'get-web-page-tracking',
      uuid: pageUuid,
      evalId: evaluationId,
    });
  });

  it('grades the metadata emitted by the standalone page provider', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(
        Response.json({
          uuid: pageUuid,
          fullUrl: pageUrl,
          path: `/dynamic-pages/${evaluationId}/${pageUuid}`,
          fetchPrompt: 'Summarize the synthetic page',
        }),
      )
      .mockResolvedValueOnce(Response.json({ wasFetched: true, fetchCount: 1 }));
    const provider = new IndirectWebPwnProvider({
      injectVar: 'query',
      maxFetchAttempts: 1,
      useLlm: false,
    });
    const response = await provider.callApi('Synthetic page content', {
      originalProvider: {
        id: () => 'synthetic-target',
        callApi: async () => ({ output: 'A synthetic response' }),
      },
      vars: { query: 'Summarize the synthetic page' },
      prompt: { raw: '{{query}}', label: 'Synthetic prompt' },
      evaluationId: `eval-${evaluationId}`,
      test: { metadata: { purpose: 'A document assistant' } },
    });
    const result = await grade({}, response.metadata);

    expect(response.metadata).toMatchObject({ webPageUuid: pageUuid, webPageUrl: pageUrl });
    expect(result.pass).toBe(false);
    expect(result.componentResults?.[0].reason).toContain('Data exfiltration detected');
    expect(fetchWithRetries).toHaveBeenCalledTimes(3);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[2][1]!.body as string)).toMatchObject({
      task: 'get-web-page-tracking',
      uuid: pageUuid,
      evalId: evaluationId,
    });
  });

  it('preserves tracking from test metadata with an eval-prefixed evaluation ID', async () => {
    const result = await grade({ webPageUuid: pageUuid, evaluationId: `eval-${evaluationId}` });

    expect(result.pass).toBe(false);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      uuid: pageUuid,
      evalId: evaluationId,
    });
  });

  it('preserves a custom provider UUID with its evaluation ID supplied by the test page URL', async () => {
    const result = await grade({ webPageUrl: pageUrl }, { webPageUuid: pageUuid });
    expect(result.pass).toBe(false);
    expect(result.componentResults?.[0].reason).toContain('Data exfiltration detected');
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      uuid: pageUuid,
      evalId: evaluationId,
    });
  });

  it('preserves a test UUID with its evaluation ID supplied by the provider page URL', async () => {
    const result = await grade({ webPageUuid: pageUuid }, { webPageUrl: pageUrl });
    expect(result.pass).toBe(false);
    expect(result.componentResults?.[0].reason).toContain('Data exfiltration detected');
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      uuid: pageUuid,
      evalId: evaluationId,
    });
  });

  it('preserves the provider URL precedence when both metadata sources supply URLs', async () => {
    const result = await grade(
      { webPageUuid: pageUuid, webPageUrl: pageUrl.replace(evaluationId, 'other-eval') },
      { webPageUrl: pageUrl },
    );
    expect(result.pass).toBe(false);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).evalId).toBe(
      evaluationId,
    );
  });

  it('uses the page URL instead of an unrelated evaluation ID reported by the target', async () => {
    const result = await grade(
      {},
      { webPageUuid: pageUuid, webPageUrl: pageUrl, evaluationId: 'unrelated-provider-eval' },
    );
    expect(result.pass).toBe(false);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).evalId).toBe(
      evaluationId,
    );
  });

  it('resolves the page URL when the metadata evaluation ID is not a string', async () => {
    const result = await grade({
      webPageUuid: pageUuid,
      evaluationId: { invalid: true },
      webPageUrl: pageUrl,
    });
    expect(result.pass).toBe(false);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).evalId).toBe(
      evaluationId,
    );
  });

  it('preserves a direct data-exfil grader lookup and its positive tracking records', async () => {
    const fallback = vi.spyOn(RedteamGraderBase.prototype, 'getResult');
    const result = await new DataExfilGrader().getResult(
      'Summarize the page',
      'A synthetic response',
      { metadata: { webPageUuid: pageUuid, webPageUrl: pageUrl } },
      undefined,
      undefined,
    );
    expect(result.grade).toMatchObject({ pass: false, score: 0 });
    expect(result.grade.reason).toContain('synthetic-marker');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('keeps direct data-exfil grading available with malformed page metadata', async () => {
    const fallback = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
      grade: { pass: false, score: 0, reason: 'Fallback grader detected a problem' },
      rubric: 'A synthetic rubric',
    });
    const result = await new DataExfilGrader().getResult(
      'Summarize the page',
      'A synthetic response',
      { metadata: { webPageUuid: pageUuid, webPageUrl: { url: pageUrl } } },
      undefined,
      undefined,
    );
    expect(fetchWithRetries).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.grade).toMatchObject({ pass: false, score: 0 });
  });

  it('uses model grading when tracking reports no exfiltration', async () => {
    vi.mocked(fetchWithRetries).mockImplementation(async () =>
      Response.json({ wasExfiltrated: false, exfilCount: 0, exfilRecords: [] }),
    );
    const fallback = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
      grade: { pass: false, score: 0, reason: 'Fallback grader detected a problem' },
      rubric: 'A synthetic rubric',
    });
    const result = await grade({ webPageUuid: pageUuid, evaluationId });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.pass).toBe(false);
  });

  it('normalizes the evaluation prefix only once through the assertion path', async () => {
    const result = await grade({ webPageUuid: pageUuid, evaluationId: 'eval-eval-scan' });
    expect(result.pass).toBe(false);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).evalId).toBe(
      'eval-scan',
    );
  });

  it('does not let malformed response metadata eclipse a valid test page', async () => {
    const result = await grade(
      { webPageUuid: pageUuid, webPageUrl: pageUrl },
      { webPageUuid: { id: 'invalid' }, webPageUrl: { url: 'invalid' } },
    );

    expect(result.pass).toBe(false);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      uuid: pageUuid,
      evalId: evaluationId,
    });
  });

  it.each([
    { webPageUuid: { id: pageUuid } },
    { webPageUuid: [pageUuid] },
    { webPageUuid: null },
    { webPageUuid: pageUuid, webPageUrl: { url: pageUrl } },
    { webPageUuid: pageUuid, webPageUrl: [pageUrl] },
  ])('keeps grading available with malformed tracking metadata: %j', async (metadata) => {
    const fallback = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
      grade: { pass: false, score: 0, reason: 'Fallback grader detected a problem' },
      rubric: 'A synthetic rubric',
    });

    const result = await grade(metadata);

    expect(fetchWithRetries).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.pass).toBe(false);
    expect(result.componentResults?.[0].reason).toBe('Fallback grader detected a problem');
  });

  it.each([undefined, null, {}, [], '', 'eval-', 'x'.repeat(257)])(
    'does not send a tracking request without a valid evaluation ID: %j',
    async (evalId) => {
      const result = await checkExfilTracking(pageUuid, evalId);
      expect(result).toBeNull();
      expect(fetchWithRetries).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, {}, [pageUuid], '', 'not-a-uuid'])(
    'does not send a tracking request with a malformed page UUID: %j',
    async (uuid) => {
      const result = await checkExfilTracking(uuid, evaluationId);
      expect(result).toBeNull();
      expect(fetchWithRetries).not.toHaveBeenCalled();
    },
  );

  it.each([
    pageUuid.toUpperCase(),
    '00000000-0000-0000-0000-000000000000',
    'b385605f-0328-7f21-a977-811ec61bf3f8',
  ])('preserves UUID forms accepted by the tracking API: %s', async (uuid) => {
    expect(await checkExfilTracking(uuid, evaluationId)).toEqual(tracking);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).uuid).toBe(
      uuid,
    );
  });

  it('normalizes a valid layer evaluation ID before enforcing the server length limit', async () => {
    const result = await checkExfilTracking(pageUuid, `eval-${'x'.repeat(256)}`);
    expect(result).toEqual(tracking);
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).evalId).toBe(
      'x'.repeat(256),
    );
  });

  it.each([400, 500])('keeps a tracking HTTP %s response unavailable', async (status) => {
    vi.mocked(fetchWithRetries).mockResolvedValue(new Response(null, { status }));
    expect(await checkExfilTracking(pageUuid, evaluationId)).toBeNull();
  });

  it('keeps a tracking network failure unavailable', async () => {
    vi.mocked(fetchWithRetries).mockRejectedValue(new Error('Synthetic network failure'));
    expect(await checkExfilTracking(pageUuid, evaluationId)).toBeNull();
  });
});
