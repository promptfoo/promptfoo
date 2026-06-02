import { mockObjectUrl, restoreBrowserMocks } from '@app/tests/browserMocks';
import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportDownloadButton from './ReportDownloadButton';
import type { ResultsFile } from '@promptfoo/types';

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
  } as unknown as ResultsFile;

  beforeEach(() => {
    vi.clearAllMocks();
    mockObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreBrowserMocks();
    vi.restoreAllMocks();
  });

  it('fetches the full evaluation when downloading JSON', async () => {
    const fullEvalData = { ...compactEvalData, traces: [{ traceId: 'trace-1' }] };
    vi.mocked(callApi).mockResolvedValue(
      new Response(JSON.stringify({ data: fullEvalData }), { status: 200 }),
    );
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
});
