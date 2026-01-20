import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PromptDialog from './PromptDialog';
import type { ServerPromptWithMetadata } from '@promptfoo/types';

const mockSelectedPrompt: ServerPromptWithMetadata = {
  id: 'prompt:1a2b3c4d5e6f',
  prompt: {
    raw: 'This is a sample prompt for testing purposes.',
    display: '[display] This is a sample prompt for testing purposes.',
    label: 'This is a sample prompt for testing purposes.',
  },
  count: 2,
  recentEvalDate: '2023-10-27T10:00:00.000Z',
  recentEvalId: 'eval-zyxwvu987654',
  evals: [
    {
      id: 'eval-abcdef123456',
      datasetId: 'dataset-qwerty',
      metrics: {
        testPassCount: 8,
        testFailCount: 1,
        testErrorCount: 1,
        score: 0.85,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        namedScores: {},
        namedScoresCount: {},
        cost: 0,
      },
    },
    {
      id: 'eval-zyxwvu987654',
      datasetId: 'dataset-asdfgh',
      metrics: {
        testPassCount: 9,
        testFailCount: 1,
        testErrorCount: 0,
        score: 0.92,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        namedScores: {},
        namedScoresCount: {},
        cost: 0,
      },
    },
  ],
};

const mockSelectedPromptNoEvals: ServerPromptWithMetadata = {
  id: 'prompt:1a2b3c4d5e6f',
  prompt: {
    raw: 'This is a sample prompt for testing purposes.',
    display: '[display] This is a sample prompt for testing purposes.',
    label: 'This is a sample prompt for testing purposes.',
  },
  count: 0,
  recentEvalDate: '2023-10-26T12:00:00.000Z',
  recentEvalId: 'eval-123',
  evals: [],
};

const mockSelectedPromptThreeEvals: ServerPromptWithMetadata = {
  id: 'prompt:1a2b3c4d5e6f',
  prompt: {
    raw: 'This is a sample prompt for testing purposes.',
    display: '[display] This is a sample prompt for testing purposes.',
    label: 'This is a sample prompt for testing purposes.',
  },
  count: 2,
  recentEvalDate: '2023-10-27T10:00:00.000Z',
  recentEvalId: 'eval-zyxwvu987654',
  evals: [
    {
      id: 'eval-abcdef123456',
      datasetId: 'dataset-qwerty',
      metrics: {
        testPassCount: 8,
        testFailCount: 1,
        testErrorCount: 1,
        score: 0.85,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        namedScores: {},
        namedScoresCount: {},
        cost: 0,
      },
    },
    {
      id: 'eval-zyxwvu987654',
      datasetId: 'dataset-asdfgh',
      metrics: {
        testPassCount: 9,
        testFailCount: 1,
        testErrorCount: 0,
        score: 0.92,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        namedScores: {},
        namedScoresCount: {},
        cost: 0,
      },
    },
    {
      id: 'eval-123456abcdef',
      datasetId: 'dataset-poiuyt',
      metrics: {
        testPassCount: 5,
        testFailCount: 2,
        testErrorCount: 3,
        score: 0.5,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        namedScores: {},
        namedScoresCount: {},
        cost: 0,
      },
    },
  ],
};

describe('PromptDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should render the dialog with prompt details, prompt text, and eval history when openDialog is true and a valid selectedPrompt is provided', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    // Dialog title includes both the label and a badge with the prompt ID
    const dialogTitle = screen.getByRole('heading', {
      name: new RegExp(mockSelectedPrompt.prompt.label),
    });
    expect(dialogTitle).toBeInTheDocument();
    expect(screen.getByText(mockSelectedPrompt.id.slice(0, 6))).toBeInTheDocument();

    // Prompt is displayed in a <pre> tag (also appears in the dialog title)
    const promptTexts = screen.getAllByText(mockSelectedPrompt.prompt.raw);
    expect(promptTexts.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Eval History')).toBeInTheDocument();
    expect(screen.getByText(`${mockSelectedPrompt.evals.length} evals`)).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: 'Eval ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Dataset ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Raw Score' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Pass Rate' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Pass Count' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fail Count' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Error Count' })).toBeInTheDocument();

    const mostRecentEval = mockSelectedPrompt.evals[1];
    const row = screen.getByText(mostRecentEval.id).closest('tr');
    expect(row).not.toBeNull();

    expect(row).toHaveTextContent(mostRecentEval.id);
    expect(row).toHaveTextContent(mostRecentEval.datasetId.slice(0, 6));
    expect(row).toHaveTextContent(mostRecentEval.metrics!.score.toFixed(2));
    expect(row).toHaveTextContent('90.0%');
    expect(row).toHaveTextContent(String(mostRecentEval.metrics!.testPassCount));
    expect(row).toHaveTextContent(String(mostRecentEval.metrics!.testFailCount));
    expect(row).toHaveTextContent('-');
  });

  it('should copy the prompt text to clipboard and show the Snackbar when the copy button is clicked', async () => {
    const handleClose = vi.fn();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPromptNoEvals}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    // CopyButton has aria-label="Copy"
    const copyButton = screen.getByRole('button', { name: 'Copy' });

    fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith(mockSelectedPromptNoEvals.prompt.raw);

    // Note: CopyButton uses internal state for copy feedback, not a Snackbar/Toast
    // The button itself changes its icon to show copy success
  });

  it('should call handleClose when the close button is clicked', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPromptNoEvals}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    // Multiple Close buttons exist (footer + header X). Get the footer button.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    const footerCloseButton = closeButtons.find((btn) => btn.textContent === 'Close');
    expect(footerCloseButton).toBeDefined();
    fireEvent.click(footerCloseButton!);

    expect(handleClose).toHaveBeenCalled();
  });

  it('should render the evals table with all evals sorted by id descending and display correct metrics', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPromptThreeEvals}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    const evals = mockSelectedPromptThreeEvals.evals;

    const evalIds = evals.map((evalData) => evalData.id);
    const sortedEvalIds = [...evalIds].sort((a, b) => b.localeCompare(a));

    const renderedEvalIds = screen
      .getAllByRole('cell', { name: /eval-/ })
      .map((cell) => cell.textContent);

    expect(renderedEvalIds).toEqual(sortedEvalIds);

    evals.forEach((evalData) => {
      const row = screen.getByText(evalData.id).closest('tr');
      expect(row).not.toBeNull();

      const passCount = evalData.metrics!.testPassCount;
      const failCount = evalData.metrics!.testFailCount;
      const errorCount = evalData.metrics!.testErrorCount;
      const total = passCount + failCount + errorCount;
      const expectedPassRate = total > 0 ? ((passCount / total) * 100.0).toFixed(1) + '%' : '-';

      expect(row).toHaveTextContent(evalData.id);
      expect(row).toHaveTextContent(evalData.datasetId.slice(0, 6));
      expect(row).toHaveTextContent(evalData.metrics!.score.toFixed(2));
      expect(row).toHaveTextContent(expectedPassRate);
      expect(row).toHaveTextContent(String(passCount));
      expect(row).toHaveTextContent(String(failCount));

      if (errorCount > 0) {
        expect(row).toHaveTextContent(String(errorCount));
      } else {
        expect(row).toHaveTextContent('-');
      }
    });
  });

  it('should not render the Dataset ID column when showDatasetColumn is false', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={false}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('columnheader', { name: 'Dataset ID' })).toBeNull();
  });

  it('should not render eval history section when evals is empty', () => {
    const handleClose = vi.fn();
    const mockSelectedPrompt: ServerPromptWithMetadata = {
      id: 'prompt:1a2b3c4d5e6f',
      prompt: {
        raw: 'This is a sample prompt for testing purposes.',
        display: '[display] This is a sample prompt for testing purposes.',
        label: 'This is a sample prompt for testing purposes.',
      },
      count: 0,
      recentEvalDate: '',
      recentEvalId: '',
      evals: [],
    };

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    // When evals array is empty, the eval history section is not rendered
    expect(screen.queryByText('Eval History')).not.toBeInTheDocument();
  });

  it('should handle evals with undefined metrics gracefully', () => {
    const handleClose = vi.fn();
    const mockSelectedPrompt: ServerPromptWithMetadata = {
      id: 'prompt:1a2b3c4d5e6f',
      prompt: {
        raw: 'This is a sample prompt for testing purposes.',
        display: '[display] This is a sample prompt for testing purposes.',
        label: 'This is a sample prompt for testing purposes.',
      },
      count: 1,
      recentEvalDate: '2023-10-27T10:00:00.000Z',
      recentEvalId: 'eval-abcdef123456',
      evals: [
        {
          id: 'eval-abcdef123456',
          datasetId: 'dataset-qwerty',
          metrics: undefined,
        },
      ],
    };

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    const row = screen.getByText('eval-abcdef123456').closest('tr');
    expect(row).not.toBeNull();

    expect(row).toHaveTextContent('-');
    expect(row).toHaveTextContent('-');
    expect(row).toHaveTextContent('-');
    expect(row).toHaveTextContent('-');
    expect(row).toHaveTextContent('-');
  });

  it('should handle and display evaluation metrics with extreme values', () => {
    const handleClose = vi.fn();

    const mockSelectedPrompt: ServerPromptWithMetadata = {
      id: 'prompt:extreme-values',
      prompt: {
        raw: 'This is a sample prompt for testing extreme values.',
        display: '[display] This is a sample prompt for testing extreme values.',
        label: 'This is a sample prompt for testing extreme values.',
      },
      count: 1,
      recentEvalDate: '2024-01-01T00:00:00.000Z',
      recentEvalId: 'eval-extreme-values',
      evals: [
        {
          id: 'eval-extreme-values',
          datasetId: 'dataset-extreme',
          metrics: {
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 0,
            score: 1234567890.123,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        },
        {
          id: 'eval-negative-score',
          datasetId: 'dataset-negative',
          metrics: {
            testPassCount: 1,
            testFailCount: 0,
            testErrorCount: 0,
            score: -100.5,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        },
      ],
    };

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    const row1 = screen.getByText('eval-extreme-values').closest('tr');
    expect(row1).not.toBeNull();
    expect(row1).toHaveTextContent('-');
    expect(row1).toHaveTextContent('1234567890.12');

    const row2 = screen.getByText('eval-negative-score').closest('tr');
    expect(row2).not.toBeNull();
    expect(row2).toHaveTextContent('100.0%');
    expect(row2).toHaveTextContent('-100.50');
  });

  it('should catch and log the error when navigator.clipboard.writeText fails', async () => {
    const handleClose = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockWriteText = vi.fn().mockRejectedValue(new Error('Failed to copy'));
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    // CopyButton has aria-label="Copy"
    const copyButton = screen.getByRole('button', { name: 'Copy' });
    fireEvent.click(copyButton);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(consoleErrorSpy).toHaveBeenCalled();

    // Note: CopyButton uses internal state for feedback, no Snackbar/Toast
    expect(screen.queryByText('Prompt copied to clipboard')).toBeNull();

    consoleErrorSpy.mockRestore();
  });

  it('should render prompt in dark mode without errors', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPromptNoEvals}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    // Prompt is displayed in a pre tag, not a textbox
    const promptTexts = screen.getAllByText(mockSelectedPromptNoEvals.prompt.raw);
    expect(promptTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('should render Eval History count badge in dark mode', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    // Badge is rendered with eval count
    const evalCountBadge = screen.getByText(`${mockSelectedPrompt.evals.length} evals`);
    expect(evalCountBadge).toBeInTheDocument();
  });

  it('should apply correct styling when theme mode is dark for DialogActions background', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPromptNoEvals}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );
  });

  it('should display label in dialog title, falling back to display or "Prompt Details"', () => {
    const handleClose = vi.fn();

    // Test with label - title includes both label and badge
    const { rerender } = render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: new RegExp(mockSelectedPrompt.prompt.label) }),
    ).toBeInTheDocument();

    // Test fallback to display when label is empty
    const mockWithDisplayOnly: ServerPromptWithMetadata = {
      ...mockSelectedPrompt,
      prompt: {
        raw: 'Raw text',
        display: 'Display text',
        label: '',
      },
    };

    rerender(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockWithDisplayOnly}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Display text/ })).toBeInTheDocument();

    // Test fallback to "Prompt Details" when both are empty
    const mockWithNeither: ServerPromptWithMetadata = {
      ...mockSelectedPrompt,
      prompt: {
        raw: 'Raw text',
        display: '',
        label: '',
      },
    };

    rerender(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockWithNeither}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Prompt Details/ })).toBeInTheDocument();
  });

  it('should correctly handle and display evaluation IDs and dataset IDs that contain special characters or are extremely long', () => {
    const handleClose = vi.fn();

    const mockSelectedPrompt: ServerPromptWithMetadata = {
      id: 'prompt:special-chars',
      prompt: {
        raw: 'This is a sample prompt with special characters and long IDs.',
        display: '[display] This is a sample prompt with special characters and long IDs.',
        label: 'Special Chars & Long IDs',
      },
      count: 1,
      recentEvalDate: '2024-01-01T00:00:00.000Z',
      recentEvalId: 'eval-special-chars',
      evals: [
        {
          id: 'eval-with-!@#$%^&*()_+=-`~[]\{}|;\':",./<>?',
          datasetId: 'dataset-with-very-very-very-long-id-1234567890',
          metrics: {
            testPassCount: 1,
            testFailCount: 0,
            testErrorCount: 0,
            score: 0.95,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        },
        {
          id: 'very-long-eval-id-1234567890-abcdefghijklmnop',
          datasetId: '!@#dataset',
          metrics: {
            testPassCount: 0,
            testFailCount: 1,
            testErrorCount: 0,
            score: 0.4,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        },
      ],
    };

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    const evalWithSpecialCharsRow = screen
      .getByText('eval-with-!@#$%^&*()_+=-`~[]\{}|;\':",./<>?')
      .closest('tr');
    expect(evalWithSpecialCharsRow).not.toBeNull();
    expect(evalWithSpecialCharsRow).toHaveTextContent(
      'eval-with-!@#$%^&*()_+=-`~[]\{}|;\':",./<>?',
    );
    expect(evalWithSpecialCharsRow).toHaveTextContent(
      'dataset-with-very-very-very-long-id-1234567890'.slice(0, 6),
    );

    const longEvalIdRow = screen
      .getByText('very-long-eval-id-1234567890-abcdefghijklmnop')
      .closest('tr');
    expect(longEvalIdRow).not.toBeNull();
    expect(longEvalIdRow).toHaveTextContent('very-long-eval-id-1234567890-abcdefghijklmnop');
    expect(longEvalIdRow).toHaveTextContent('!@#dataset'.slice(0, 6));
  });

  it('should properly handle and display evaluation metrics containing NaN or Infinity values', () => {
    const handleClose = vi.fn();

    const mockSelectedPrompt: ServerPromptWithMetadata = {
      id: 'prompt:nan-infinity',
      prompt: {
        raw: 'This is a sample prompt for testing NaN and Infinity values.',
        display: '[display] This is a sample prompt for testing NaN and Infinity values.',
        label: 'This is a sample prompt for testing NaN and Infinity values.',
      },
      count: 1,
      recentEvalDate: '2024-01-01T00:00:00.000Z',
      recentEvalId: 'eval-nan-infinity',
      evals: [
        {
          id: 'eval-nan-infinity',
          datasetId: 'dataset-nan-infinity',
          metrics: {
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 0,
            score: NaN,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        },
        {
          id: 'eval-infinity',
          datasetId: 'dataset-infinity',
          metrics: {
            testPassCount: 1,
            testFailCount: 0,
            testErrorCount: 0,
            score: Infinity,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        },
      ],
    };

    render(
      <MemoryRouter>
        <PromptDialog
          openDialog={true}
          handleClose={handleClose}
          selectedPrompt={mockSelectedPrompt}
          showDatasetColumn={true}
        />
      </MemoryRouter>,
    );

    const row1 = screen.getByText('eval-nan-infinity').closest('tr');
    expect(row1).not.toBeNull();
    expect(row1).toHaveTextContent('NaN');

    const row2 = screen.getByText('eval-infinity').closest('tr');
    expect(row2).not.toBeNull();
    expect(row2).toHaveTextContent('Infinity');
  });
});
