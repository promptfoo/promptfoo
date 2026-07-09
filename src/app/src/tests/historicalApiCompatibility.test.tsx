import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { useEvalOperations } from '@app/hooks/useEvalOperations';
import { useModelAuditConfigStore } from '@app/pages/model-audit/stores/useModelAuditConfigStore';
import { useModelAuditHistoryStore } from '@app/pages/model-audit/stores/useModelAuditHistoryStore';
import useApiConfig from '@app/stores/apiConfig';
import { mockBrowserProperty } from '@app/tests/browserMocks';
import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

describe('historical API responses through real typed clients', () => {
  beforeEach(() => {
    useApiConfig.getState().setApiBaseUrl('');
    useModelAuditConfigStore.setState({
      installationStatus: {
        checking: false,
        installed: null,
        error: null,
        cwd: null,
      },
    });
    useModelAuditHistoryStore.setState({
      historicalScans: [],
      isLoadingHistory: false,
      historyError: null,
      totalCount: 0,
      pageSize: 25,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
    });
  });

  it('keeps an installed ModelAudit CLI available when version is omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        installed: true,
        cwd: '/workspace',
      }),
    );
    mockBrowserProperty(globalThis, 'fetch', fetchMock as typeof fetch);

    await expect(useModelAuditConfigStore.getState().checkInstallation()).resolves.toEqual({
      installed: true,
      cwd: '/workspace',
    });

    expect(useModelAuditConfigStore.getState().installationStatus).toEqual({
      checking: false,
      installed: true,
      error: null,
      cwd: '/workspace',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/model-audit/check-installed', { method: 'GET' });
  });

  it('loads a historical scan list without response pagination fields', async () => {
    const scan = {
      id: 'scan-1',
      createdAt: 1,
      updatedAt: 2,
      modelPath: '/workspace/model.pkl',
      results: { path: '/workspace/model.pkl', success: true, issues: [] },
      hasErrors: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ scans: [scan], total: 1 }));
    mockBrowserProperty(globalThis, 'fetch', fetchMock as typeof fetch);

    await useModelAuditHistoryStore.getState().fetchHistoricalScans();

    expect(useModelAuditHistoryStore.getState()).toMatchObject({
      historicalScans: [scan],
      historyError: null,
      totalCount: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/model-audit\/scans\?/),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('defaults a domain-only share response to the community banner behavior', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ domain: 'localhost' }));
    mockBrowserProperty(globalThis, 'fetch', fetchMock as typeof fetch);

    render(<EnterpriseBanner evalId="legacy-eval" />);

    expect(
      await screen.findByText(
        /You're using the community edition of Promptfoo's red teaming suite/i,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/results/share/check-domain?id=legacy-eval', {
      method: 'GET',
    });
  });

  it('preserves a structured replay output through the schema and hook', async () => {
    const output = {
      content: [{ type: 'text', text: 'Structured replay' }],
      toolCalls: [{ name: 'lookup', arguments: { id: 42 } }],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output }));
    mockBrowserProperty(globalThis, 'fetch', fetchMock as typeof fetch);
    const { result } = renderHook(() => useEvalOperations());

    let replayResult;
    await act(async () => {
      replayResult = await result.current.replayEvaluation({
        evaluationId: 'legacy-eval',
        prompt: 'Replay this',
        testIndex: 0,
      });
    });

    expect(replayResult).toEqual({ output });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/eval/replay',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
