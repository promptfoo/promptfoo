import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { createCodexSecurityResult } from '@app/tests/fixtures/codexSecurity';
import { renderWithProviders } from '@app/utils/testutils';
import { ResultFailureReason } from '@promptfoo/types';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EvalOutputCell from './EvalOutputCell';
import type { EvaluateTableOutput } from '@promptfoo/types';

describe('Codex Security output details', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it.each(['sdk', 'saved-report'] as const)(
    'opens the full %s report and diagnostics when the rendered prompt is empty',
    async (kind) => {
      const user = userEvent.setup();
      const report = JSON.stringify({ status: 'failed', scanId: 'recorded-scan' });
      const output: EvaluateTableOutput = {
        id: 'empty-prompt-report',
        prompt: '',
        provider: 'openai:codex-security',
        text: report,
        pass: false,
        score: 0,
        cost: 0,
        latencyMs: 0,
        failureReason: ResultFailureReason.ERROR,
        namedScores: {},
        testCase: {},
        metadata: {
          codexSecurity: createCodexSecurityResult({
            source: { kind, mocked: false },
            status: 'failed',
            error: 'Report publication failed.',
            diagnostics: { phase: 'scan', warningAvailability: 'observed' },
            warnings: ['Publication was incomplete.'],
          }),
        },
      };

      renderWithProviders(
        <ShiftKeyProvider>
          <EvalOutputCell
            output={output}
            maxTextLength={100}
            rowIndex={0}
            promptIndex={0}
            showStats={false}
            showDiffs={false}
            onRating={vi.fn()}
          />
        </ShiftKeyProvider>,
      );

      expect(screen.queryByText(report)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'View output and test details' }));

      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByText('Original Output')).toBeInTheDocument();
      expect(dialog.getByText(report)).toBeInTheDocument();
      expect(dialog.getByText('Report publication failed.')).toBeInTheDocument();
      expect(dialog.getByText('Failure phase').nextElementSibling).toHaveTextContent('Scan');
      expect(dialog.getByText('Publication was incomplete.')).toBeInTheDocument();
    },
  );
});
