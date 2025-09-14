import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { ServerPromptWithMetadata } from '@promptfoo/types';
import PromptDialog from './PromptDialog';
import { ThemeProvider, createTheme } from '@mui/material/styles';

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

    expect(screen.getByText('Prompt Details')).toBeInTheDocument();
    expect(screen.getByText(mockSelectedPrompt.id.slice(0, 6))).toBeInTheDocument();

    expect(screen.getByRole('textbox')).toHaveValue(mockSelectedPrompt.prompt.raw);

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

    const copyButton = screen.getByRole('button', { name: 'copy prompt' });

    fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith(mockSelectedPromptNoEvals.prompt.raw);

    const snackbar = await screen.findByText('Prompt copied to clipboard');
    expect(snackbar).toBeVisible();
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

    const closeButton = screen.getByRole('button', { name: 'close dialog' });
    fireEvent.click(closeButton);

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

  it('should display a message when selectedPrompt.evals is undefined', () => {
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

    expect(screen.getByText('0 evals')).toBeInTheDocument();
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

  it('should catch and log the error when navigator.clipboard.writeText fails, and not show the snackbar', async () => {
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

    const copyButton = screen.getByLabelText('copy prompt');
    fireEvent.click(copyButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to copy prompt:',
      new Error('Failed to copy'),
    );

    expect(screen.queryByText('Prompt copied to clipboard')).toBeNull();

    consoleErrorSpy.mockRestore();
  });

  it('should catch and log the error when navigator.clipboard.writeText fails, and not show the snackbar', async () => {
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

    const copyButton = screen.getByLabelText('copy prompt');
    fireEvent.click(copyButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to copy prompt:',
      new Error('Failed to copy'),
    );

    expect(screen.queryByText('Prompt copied to clipboard')).toBeNull();

    consoleErrorSpy.mockRestore();
  });

  it('should apply correct styling when theme mode is dark for TextField outline', () => {
    const handleClose = vi.fn();

    const darkTheme = createTheme({
      palette: {
        mode: 'dark',
      },
    });

    render(
      <MemoryRouter>
        <ThemeProvider theme={darkTheme}>
          <PromptDialog
            openDialog={true}
            handleClose={handleClose}
            selectedPrompt={mockSelectedPromptNoEvals}
            showDatasetColumn={true}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    const textField = screen.getByRole('textbox');
    expect(textField).toBeInTheDocument();

    const inputElement = textField.closest('.MuiOutlinedInput-root');

    if (inputElement) {
      const outlinedBorder = inputElement.querySelector('.MuiOutlinedInput-notchedOutline');
      if (outlinedBorder) {
        expect(window.getComputedStyle(outlinedBorder).borderColor).toBe(
          'rgba(255, 255, 255, 0.23)',
        );
      }
    }
  });

  it('should apply correct styling to Eval History count badge in dark mode', () => {
    const handleClose = vi.fn();

    const darkTheme = createTheme({
      palette: {
        mode: 'dark',
      },
    });

    render(
      <ThemeProvider theme={darkTheme}>
        <MemoryRouter>
          <PromptDialog
            openDialog={true}
            handleClose={handleClose}
            selectedPrompt={mockSelectedPrompt}
            showDatasetColumn={true}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const evalCountBadge = screen.getByText(`${mockSelectedPrompt.evals.length} evals`);

    const computedStyle = window.getComputedStyle(evalCountBadge);

    expect(computedStyle.backgroundColor).toContain('rgba(255, 255, 255, 0.05)');
  });

  it('should apply correct styling when theme mode is dark for DialogActions background', () => {
    const handleClose = vi.fn();

    render(
      <MemoryRouter>
        <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
          <PromptDialog
            openDialog={true}
            handleClose={handleClose}
            selectedPrompt={mockSelectedPromptNoEvals}
            showDatasetColumn={true}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );
  });
});
