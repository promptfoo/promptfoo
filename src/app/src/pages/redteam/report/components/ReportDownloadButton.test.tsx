import type { ComponentProps } from 'react';

import { mockCallApiResponse, resetCallApiMock } from '@app/tests/apiMocks';
import { mockObjectUrl, restoreBrowserMocks } from '@app/tests/browserMocks';
import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    renderWithProviders(
      <ReportDownloadButton
        evalId="eval/report id"
        evalDescription="Report"
        evalData={compactEvalData}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'download report' }));
    await user.click(await screen.findByText('JSON'));

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/results/eval%2Freport%20id', {
        cache: 'no-store',
      });
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
  });

  it('uses the provider-reported final prompt in CSV exports', async () => {
    const evalData = {
      ...compactEvalData,
      config: { redteam: { injectVar: 'attackInput' } },
      results: {
        ...compactEvalData.results,
        results: [
          {
            promptIdx: 0,
            testIdx: 0,
            testCase: { metadata: { strategyId: 'basic' } },
            promptId: 'prompt-1',
            provider: { id: 'provider-1' },
            prompt: { raw: 'target {{attackInput}}', label: 'target' },
            vars: { attackInput: 'original attack seed' },
            response: {
              output: 'response',
              prompt: 'FINAL_LAYER_ATTACK',
              metadata: {
                transformDisplayVars: { embeddedInjection: 'display-only helper value' },
              },
            },
            failureReason: 1,
            success: false,
            score: 0,
            latencyMs: 1,
            namedScores: {},
            metadata: { pluginId: 'harmful:violent-crime' },
            gradingResult: { pass: false, score: 0, reason: 'attack succeeded' },
          },
        ],
      },
    } as unknown as EvalData;
    const user = userEvent.setup();

    renderWithProviders(
      <ReportDownloadButton evalId="eval-1" evalDescription="Report" evalData={evalData} />,
    );

    await user.click(screen.getByRole('button', { name: 'download report' }));
    await user.click(await screen.findByText('CSV'));

    const csvBlob = (objectUrlMock.createObjectURL.mock.calls as unknown as [[Blob]])[0][0];
    expect(await csvBlob.text()).toContain('FINAL_LAYER_ATTACK');
    expect(await csvBlob.text()).not.toContain('display-only helper value');
  });
});
