import type { ComponentProps } from 'react';

import { ToastProvider } from '@app/contexts/ToastContext';
import { mockCallApiResponse, resetCallApiMock } from '@app/tests/apiMocks';
import { mockObjectUrl, restoreBrowserMocks } from '@app/tests/browserMocks';
import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parse as parseCsv } from 'csv-parse/browser/esm/sync';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportDownloadButton from './ReportDownloadButton';

vi.mock('@app/utils/api');
vi.mock('@app/hooks/useCustomPoliciesMap', () => ({
  useCustomPoliciesMap: () => ({}),
}));
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

describe('ReportDownloadButton', () => {
  type EvalData = ComponentProps<typeof ReportDownloadButton>['evalData'];

  const compactEvalData = {
    version: 4,
    createdAt: '2026-06-02T00:00:00.000Z',
    config: { redteam: {} },
    prompts: [],
    results: {
      version: 3,
      timestamp: '2026-06-02T00:00:00.000Z',
      results: [],
    },
  } as unknown as EvalData;
  let objectUrlMock: ReturnType<typeof mockObjectUrl>;

  const getDownloadedBlob = () =>
    (objectUrlMock.createObjectURL.mock.calls as unknown as [[Blob]])[0][0];

  const renderDownloadButton = (props?: Partial<ComponentProps<typeof ReportDownloadButton>>) =>
    renderWithProviders(
      <ToastProvider>
        <ReportDownloadButton
          evalId="eval-1"
          evalDescription="Report"
          evalData={compactEvalData}
          {...props}
        />
      </ToastProvider>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    resetCallApiMock();
    objectUrlMock = mockObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreBrowserMocks();
    vi.restoreAllMocks();
  });

  it('fetches the full evaluation when downloading JSON', async () => {
    const fullEvalData = { ...compactEvalData, traces: [{ traceId: 'trace-1' }] };
    mockCallApiResponse({ data: fullEvalData });
    const user = userEvent.setup();

    renderDownloadButton({ evalId: 'eval/report id' });

    await user.click(screen.getByRole('button', { name: 'download report' }));
    await user.click(await screen.findByText('JSON'));

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/results/eval%2Freport%20id', {
        cache: 'no-store',
      });
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });

    const jsonBlob = getDownloadedBlob();
    expect(jsonBlob.type).toBe('application/json;charset=utf-8;');
    expect(await jsonBlob.text()).toBe(JSON.stringify(fullEvalData, null, 2));
  });

  it('shows an error and does not create a JSON file when the full evaluation request fails', async () => {
    mockCallApiResponse({ error: 'server error' }, { ok: false, status: 500 });
    const user = userEvent.setup();

    renderDownloadButton();

    await user.click(screen.getByRole('button', { name: 'download report' }));
    await user.click(await screen.findByText('JSON'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to download JSON: Failed to load full evaluation data (500)',
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('exports compact result status while neutralizing CSV formulas', async () => {
    const pluginId = '=HYPERLINK("https://evil.example","click")';
    const evalData = {
      ...compactEvalData,
      config: { redteam: { injectVar: 'attackInput' } },
      results: {
        ...compactEvalData.results,
        results: [
          {
            promptIdx: 0,
            testIdx: 0,
            testCase: { metadata: { strategyId: '@SUM(A1)' } },
            promptId: 'prompt-1',
            provider: { id: 'provider-1', label: '+3.14' },
            prompt: { raw: 'target {{attackInput}}', label: 'target' },
            vars: { attackInput: 'original attack seed' },
            response: {
              output: '-5.25',
              prompt: '=FINAL_LAYER_ATTACK',
              metadata: {
                transformDisplayVars: { embeddedInjection: 'display-only helper value' },
              },
            },
            failureReason: 1,
            success: false,
            score: 0,
            latencyMs: 1,
            namedScores: {},
            metadata: { pluginId },
          },
        ],
      },
    } as unknown as EvalData;
    const user = userEvent.setup();

    renderDownloadButton({ evalData });

    await user.click(screen.getByRole('button', { name: 'download report' }));
    await user.click(await screen.findByText('CSV'));

    const csvBlob = getDownloadedBlob();
    const [headers, values] = parseCsv(await csvBlob.text()) as string[][];
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));

    expect(row).toMatchObject({
      Plugin: `'${pluginId}`,
      'Plugin ID': `'${pluginId}`,
      Strategy: "'@SUM(A1)",
      Target: '+3.14',
      Prompt: "'=FINAL_LAYER_ATTACK",
      Response: '-5.25',
      Pass: 'Fail (0)',
      Score: '0',
      Reason: '',
      Timestamp: '2026-06-02T00:00:00.000Z',
    });
    expect(await csvBlob.text()).not.toContain('display-only helper value');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
