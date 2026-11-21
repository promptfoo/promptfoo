import type { ComponentProps } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockBrowserProperty, restoreBrowserMocks } from '@app/tests/browserMocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parse } from 'csv-parse/browser/esm/sync';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FrameworkCsvExporter from './FrameworkCsvExporter';
import ReportDownloadButton from './ReportDownloadButton';

type ResultsFile = ComponentProps<typeof ReportDownloadButton>['evalData'];

const { recordEvent } = vi.hoisted(() => ({ recordEvent: vi.fn() }));
vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: () => ({ recordEvent }) }));
vi.mock('@app/hooks/useCustomPoliciesMap', () => ({ useCustomPoliciesMap: () => ({}) }));

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('report exports', () => {
  let exportedBlob: Blob;
  let downloadedName: string;

  beforeEach(() => {
    recordEvent.mockClear();
    mockBrowserProperty(
      URL,
      'createObjectURL',
      vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:report-export';
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });
  });

  afterEach(() => {
    restoreBrowserMocks();
    vi.restoreAllMocks();
  });

  const evalData = {
    version: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    config: {},
    results: {
      results: [
        {
          testCase: { metadata: { pluginId: 'prompt-extraction', strategyId: 'jailbreak' } },
          provider: { id: 'echo', label: 'Target' },
          vars: { prompt: 'Question, with "quotes"\nand a newline' },
          prompt: { raw: 'fallback' },
          response: { output: 'Answer, with "quotes"' },
          gradingResult: { pass: true, score: 1, reason: 'Passed' },
        },
      ],
    },
  } as unknown as ResultsFile;

  it.each(['CSV', 'JSON'] as const)(
    'downloads %s with the expected payload, filename, and telemetry',
    async (format) => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <ReportDownloadButton evalDescription="Example Report!" evalData={evalData} />
        </TooltipProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'download report' }));
      await user.click(screen.getByRole('menuitem', { name: format }));
      expect(downloadedName).toBe(`report_example-report.${format.toLowerCase()}`);
      expect(recordEvent).toHaveBeenCalledWith('webui_action', {
        action: 'redteam_report_export',
        format: format.toLowerCase(),
      });
      const content = await readBlob(exportedBlob);
      if (format === 'JSON') {
        expect(JSON.parse(content)).toEqual(evalData);
        expect(exportedBlob.type).toBe('application/json;charset=utf-8;');
      } else {
        const rows = parse(content, { columns: true });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          Target: 'Target',
          Prompt: 'Question, with "quotes"\nand a newline',
          Response: 'Answer, with "quotes"',
          Pass: 'Pass (1)',
        });
        expect(exportedBlob.type).toBe('text/csv;charset=utf-8;');
      }
    },
  );

  it.each(['CSV', 'JSON'] as const)(
    'restores the download button when %s export fails',
    async (format) => {
      const failure = new Error('Download unavailable');
      vi.mocked(URL.createObjectURL).mockImplementation(() => {
        throw failure;
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <ReportDownloadButton evalDescription="Example" evalData={evalData} />
        </TooltipProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'download report' }));
      await user.click(screen.getByRole('menuitem', { name: format }));
      expect(consoleError).toHaveBeenCalledWith(`Error generating ${format}:`, failure);
      expect(screen.getByRole('button', { name: 'download report' })).toBeEnabled();
    },
  );

  it.each(['owasp:llm', 'nist:ai:measure'] as const)(
    'exports tested and untested rows for %s',
    async (framework) => {
      const user = userEvent.setup();
      render(
        <FrameworkCsvExporter
          categoryStats={{ 'pii:direct': { pass: 8, total: 10, failCount: 2 } }}
          pluginPassRateThreshold={0.8}
          frameworksToShow={[framework]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Export framework results to CSV' }));
      const rows: Record<string, string>[] = parse(await readBlob(exportedBlob), { columns: true });
      expect(downloadedName).toMatch(/^framework-compliance-\d{4}-\d{2}-\d{2}\.csv$/);
      const testedRows = rows.filter((row) => row['Tests Run'] === '10');
      expect(testedRows.length).toBeGreaterThan(0);
      for (const row of testedRows) {
        expect(row).toMatchObject({
          'Attacks Successful': '2',
          'Attack Success Rate (%)': '20.00',
          Status: 'Pass',
        });
        expect(row.Category === 'N/A').toBe(framework === 'nist:ai:measure');
      }
      expect(rows.some((row) => row.Status === 'Not Tested' && row['Tests Run'] === '0')).toBe(
        true,
      );
    },
  );
});
