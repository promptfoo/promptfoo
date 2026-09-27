import type { ComponentProps } from 'react';

import { mockObjectUrl } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parse } from 'csv-parse/browser/esm/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReportDownloadButton from './ReportDownloadButton';

type ResultsFile = ComponentProps<typeof ReportDownloadButton>['evalData'];
type EvaluateResult = ResultsFile['results']['results'][number];

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('ReportDownloadButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exports actual attack prompts to CSV while preserving original results in JSON', async () => {
    const chat = [{ role: 'user' as const, content: 'final chat attack' }];
    const cases: { result: Partial<EvaluateResult>; expected: string }[] = [
      {
        result: { response: { output: 'answer', prompt: 'final, "quoted"\nattack' } },
        expected: 'final, "quoted"\nattack',
      },
      {
        result: { response: { output: 'answer', prompt: chat } },
        expected: JSON.stringify(chat),
      },
      {
        result: {
          response: { output: 'answer', metadata: { redteamFinalPrompt: 'legacy response' } },
        },
        expected: 'legacy response',
      },
      {
        result: { metadata: { redteamFinalPrompt: 'legacy result' } },
        expected: 'legacy result',
      },
      {
        result: {
          response: {
            output: 'answer',
            prompt: 'provider final',
            metadata: { redteamFinalPrompt: 'older response' },
          },
          metadata: { redteamFinalPrompt: 'older result' },
        },
        expected: 'provider final',
      },
      {
        result: { vars: { query: 'original query', prompt: 'original prompt' } },
        expected: 'original query',
      },
      { result: {}, expected: 'seed prompt' },
      { result: { response: { output: 'answer', prompt: '' } }, expected: 'seed prompt' },
      { result: { vars: {} }, expected: 'rendered prompt' },
    ];
    const evalData = {
      version: 4,
      createdAt: '2026-01-01T00:00:00.000Z',
      config: {},
      prompts: [{ id: 'prompt-1', raw: 'rendered prompt', label: 'Prompt' }],
      results: {
        results: cases.map(({ result }, index) => ({
          id: `result-${index}`,
          testIdx: index,
          promptIdx: 0,
          promptId: 'prompt-1',
          prompt: { raw: 'rendered prompt', label: 'Prompt' },
          provider: { id: 'target' },
          vars: { prompt: 'seed prompt' },
          testCase: { metadata: { pluginId: 'harmful:hate', strategyId: 'jailbreak' } },
          response: { output: 'answer' },
          gradingResult: { pass: true, score: 1, reason: 'graded final response' },
          success: true,
          score: 1,
          latencyMs: 0,
          ...result,
        })),
      },
    } as ResultsFile;
    const original = structuredClone(evalData);
    for (const result of evalData.results.results) {
      Object.freeze(result.vars);
    }
    mockObjectUrl('blob:report');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithProviders(<ReportDownloadButton evalDescription="QA report" evalData={evalData} />);
    const download = async (format: 'CSV' | 'JSON') => {
      await user.click(screen.getByRole('button', { name: 'download report' }));
      await user.click(screen.getByRole('menuitem', { name: format }));
      const calls = vi.mocked(URL.createObjectURL).mock.calls;
      return readBlob(calls[calls.length - 1][0] as Blob);
    };

    const rows = parse<Record<string, string>>(await download('CSV'), { columns: true });
    expect(rows.map((row) => row.Prompt)).toEqual(cases.map(({ expected }) => expected));
    for (const row of rows) {
      expect(row).toMatchObject({
        Response: 'answer',
        Pass: 'Pass (1)',
        Score: '1',
        Reason: 'graded final response',
      });
    }
    expect(JSON.parse(await download('JSON'))).toEqual(original);
    expect(evalData).toEqual(original);
  });
});
