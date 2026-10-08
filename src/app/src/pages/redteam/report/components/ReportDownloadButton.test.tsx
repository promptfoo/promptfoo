import { mockObjectUrl, restoreBrowserMocks } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parse } from 'csv-parse/browser/esm/sync';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportDownloadButton from './ReportDownloadButton';
import type { ResultsFile } from '@promptfoo/types';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));
vi.mock('@app/hooks/useCustomPoliciesMap', () => ({
  useCustomPoliciesMap: () => ({}),
}));

describe('ReportDownloadButton CSV response data', () => {
  beforeEach(() => {
    mockObjectUrl('blob:null-data');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreBrowserMocks();
  });

  it.each([
    { output: null, expected: 'null' },
    { output: undefined, expected: '' },
  ])(
    'exports $output without confusing null with an absent response',
    async ({ output, expected }) => {
      const data = {
        createdAt: '2026-01-01T00:00:00Z',
        results: {
          results: [
            {
              vars: {},
              prompt: { raw: 'Return JSON' },
              provider: { id: 'fixture' },
              response: { output },
              testCase: { metadata: { pluginId: 'ssrf', strategyId: 'basic' } },
              gradingResult: { pass: true, score: 1, reason: 'Fixture passed' },
            },
          ],
        },
      } as unknown as ResultsFile;
      const user = userEvent.setup();
      renderWithProviders(<ReportDownloadButton evalDescription="JSON data" evalData={data} />);

      await user.click(screen.getByRole('button', { name: 'download report' }));
      await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));

      const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
      const csv = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      const rows = parse(csv, { columns: true }) as Array<{ Response: string }>;
      expect(rows[0].Response).toBe(expected);
    },
  );
});
