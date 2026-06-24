import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import DatasetDialog from './DatasetDialog';
import type { TestCasesWithMetadata } from '@promptfoo/types';

describe('DatasetDialog', () => {
  it('keeps the prompts table wide enough to scroll on narrow screens', () => {
    render(
      <MemoryRouter>
        <DatasetDialog
          openDialog
          handleClose={vi.fn()}
          testCase={
            {
              id: 'dataset-1',
              recentEvalDate: '2026-05-03T00:00:00.000Z',
              testCases: [{ vars: { prompt: 'hello' } }],
              prompts: [
                {
                  id: 'prompt-1',
                  evalId: 'eval-1',
                  prompt: {
                    raw: '{{prompt}}',
                    metrics: {
                      score: 1,
                      testPassCount: 1,
                      testFailCount: 0,
                      testErrorCount: 0,
                    },
                  },
                },
              ],
            } as unknown as TestCasesWithMetadata & { recentEvalDate: string }
          }
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('table')).toHaveClass('min-w-[720px]', 'w-full');
  });

  it('keeps actions visible while dataset details scroll independently', () => {
    render(
      <MemoryRouter>
        <DatasetDialog
          openDialog
          handleClose={vi.fn()}
          testCase={
            {
              id: 'dataset-1',
              recentEvalDate: '2026-05-03T00:00:00.000Z',
              testCases: [{ vars: { prompt: 'hello' } }],
              prompts: [],
            } as unknown as TestCasesWithMetadata & { recentEvalDate: string }
          }
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('flex', 'max-h-[90vh]', 'flex-col');
    expect(screen.getByTestId('dataset-dialog-scroll-body')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
    );
    expect(screen.getByTestId('dataset-dialog-footer')).toHaveClass('shrink-0');
  });
});
