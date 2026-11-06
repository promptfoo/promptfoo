/// <reference types="@vitest/browser/matchers" />

import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { ResultFailureReason } from '@promptfoo/types/results';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import EvalOutputCell from './EvalOutputCell';
import type { EvaluateTableOutput } from '@promptfoo/types';
import '@app/index.css';
import './ResultsTable.css';

vi.mock('@app/hooks/useCloudConfig', () => ({
  default: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('./store', () => ({
  useResultsViewSettingsStore: () => ({
    prettifyJson: false,
    renderMarkdown: true,
    showPassFail: true,
    showPassReasons: false,
    showMetricPills: true,
    showPrompts: true,
    maxImageWidth: 256,
    maxImageHeight: 256,
  }),
  useTableStore: () => ({ shouldHighlightSearchText: false }),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('metric-only result reporting in Chromium', () => {
  it.each([
    { pass: true, marker: 'assertion' },
    { pass: false, marker: 'assertion' },
    { pass: true, marker: 'metadata' },
    { pass: false, marker: 'metadata' },
  ])(
    'retains an aggregate pass=$pass with a failing metric-only $marker marker',
    async ({ pass, marker }) => {
      const reason = pass ? 'All assertions passed' : 'Aggregate score 0.60 < 0.8 threshold';
      const output: EvaluateTableOutput = {
        id: 'metric-only-browser',
        pass,
        score: 0.6,
        text: 'A measured response',
        prompt: 'Test prompt',
        testCase: pass ? {} : { threshold: 0.8 },
        cost: 0,
        latencyMs: 100,
        namedScores: { counter: 0 },
        failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        gradingResult: {
          pass,
          score: 0.6,
          reason,
          componentResults: [
            { pass: true, score: 0.6, reason: 'Quality passed', assertion: { type: 'javascript' } },
            {
              pass: false,
              score: 0,
              reason: 'Counter scored 0',
              ...(marker === 'metadata'
                ? { metadata: { metricOnly: true } }
                : { assertion: { type: 'javascript', metric: 'counter', metricOnly: true } }),
            },
          ],
        },
      };
      container = document.createElement('div');
      container.dataset.testid = 'metric-only-cell';
      document.body.append(container);
      root = createRoot(container);
      flushSync(() =>
        root?.render(
          <TooltipProvider>
            <ShiftKeyProvider>
              <table className="results-table">
                <tbody>
                  <tr>
                    <td>
                      <EvalOutputCell
                        output={output}
                        maxTextLength={100}
                        rowIndex={0}
                        promptIndex={0}
                        showStats={false}
                        showDiffs={false}
                        onRating={vi.fn()}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </ShiftKeyProvider>
          </TooltipProvider>,
        ),
      );

      await expect
        .element(page.getByText(pass ? /^PASS \(0\.60\)$/ : /^FAIL \(0\.60\)$/))
        .toBeVisible();
      expect(container.querySelector(`.status.${pass ? 'pass' : 'fail'}`)).not.toBeNull();
      await expect
        .element(page.getByText('Counter scored 0', { exact: true }))
        .not.toBeInTheDocument();
      if (!pass) {
        await expect.element(page.getByText(reason, { exact: true })).toBeVisible();
      }
    },
  );
});
