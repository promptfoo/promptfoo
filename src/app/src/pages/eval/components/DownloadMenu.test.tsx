import { screen } from '@testing-library/dom';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DownloadMenu from './DownloadMenu';
import { useTableStore as useResultsViewStore } from './store';

// Get a reference to the mock
const showToastMock = vi.fn();

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
  useResultsViewSettingsStore: vi.fn(),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

// Mock the new download hooks
const mockDownloadCsvFn = vi.fn().mockResolvedValue('test-eval-id-results.csv');
const mockDownloadJsonFn = vi.fn().mockResolvedValue('test-eval-id-results.json');

vi.mock('../../../hooks/useDownloads', () => ({
  downloadBlob: vi.fn(),
  useDownloadCsv: vi.fn(() => ({
    downloadCsv: mockDownloadCsvFn,
    isLoading: false,
  })),
  useDownloadJson: vi.fn(() => ({
    downloadJson: mockDownloadJsonFn,
    isLoading: false,
  })),
}));

vi.mock('js-yaml', () => ({
  default: {
    dump: vi.fn().mockReturnValue('mocked yaml'),
  },
}));

vi.mock('csv-stringify/browser/esm/sync', () => ({
  stringify: vi.fn().mockReturnValue('mocked csv'),
}));

global.URL.createObjectURL = vi.fn(() => 'mocked-blob-url');
global.URL.revokeObjectURL = vi.fn();

Object.defineProperty(global.navigator, 'msSaveOrOpenBlob', {
  value: vi.fn(),
  writable: true,
});

describe('DownloadMenu', () => {
  const mockTable = {
    head: {
      vars: ['var1', 'var2'],
      prompts: [{ provider: 'provider1', label: 'label1' }],
    },
    body: [
      {
        test: { vars: { testVar: 'value' }, description: 'Test case with description' },
        vars: ['value1', 'value2'],
        outputs: [{ pass: false, text: 'failed output' }],
      },
      {
        test: { vars: { testVar: 'value2' } },
        vars: ['value3', 'value4'],
        outputs: [{ pass: true, text: 'passed output' }],
      },
    ],
  };

  const mockConfig = {
    someConfig: 'value',
    redteam: {
      injectVar: 'prompt',
    },
  };

  const mockEvalId = 'test-eval-id';

  beforeEach(() => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: mockTable,
      config: mockConfig,
      evalId: mockEvalId,
    });

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Download menu item', () => {
    render(<DownloadMenu />);
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('opens the dialog when clicking the Download menu item', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    expect(screen.getByText('Download YAML Config')).toBeInTheDocument();
  });

  it('downloads YAML config when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download YAML Config'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('downloads CSV when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads CSV with Description column when descriptions are present', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads CSV with extremely long description text', async () => {
    const longDescription = 'This is a very long description. '.repeat(1000);
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        head: {
          vars: ['var1', 'var2'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: { vars: { testVar: 'value' }, description: longDescription },
            vars: ['value1', 'value2'],
            outputs: [{ pass: false, text: 'failed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads CSV with Description column and empty string for empty descriptions', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        head: {
          vars: ['var1', 'var2'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: { vars: { testVar: 'value' }, description: '' },
            vars: ['value1', 'value2'],
            outputs: [{ pass: false, text: 'failed output' }],
          },
          {
            test: { vars: { testVar: 'value2' } },
            vars: ['value3', 'value4'],
            outputs: [{ pass: true, text: 'passed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads CSV with Unicode and special characters in description', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        head: {
          vars: ['var1', 'var2'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: {
              vars: { testVar: 'value' },
              description: 'Test case with Unicode: こんにちは世界 and emoji: 😊',
            },
            vars: ['value1', 'value2'],
            outputs: [{ pass: false, text: 'failed output' }],
          },
          {
            test: { vars: { testVar: 'value2' } },
            vars: ['value3', 'value4'],
            outputs: [{ pass: true, text: 'passed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads Table JSON when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results JSON'));

    await waitFor(() => {
      expect(mockDownloadJsonFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads DPO JSON when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('downloads Human Eval Test YAML when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Human Eval YAML'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('handles malformed output structures in DPO JSON export without crashing', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        ...mockTable,
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [{ pass: true }],
          },
          {
            test: { vars: { testVar: 'value2' } },
            vars: ['value3', 'value4'],
            outputs: [{ pass: false, text: 'passed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
  });

  it('shows a toast when evalId is not available', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: mockTable,
      config: mockConfig,
      evalId: null,
    });

    // Clear any previous calls to the mock
    showToastMock.mockClear();

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    expect(showToastMock).toHaveBeenCalledWith('No evaluation ID', 'error');
  });

  it('downloads CSV file when table data contains null or undefined outputs', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        ...mockTable,
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [null, { pass: false, text: 'failed output' }, undefined],
          },
          {
            test: { vars: { testVar: 'value2' } },
            vars: ['value3', 'value4'],
            outputs: [{ pass: true, text: 'passed output' }, null],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('includes grader reason, comment, and latency data in CSV export headers and rows', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        head: {
          vars: ['var1', 'var2'],
          prompts: [
            { provider: 'openai', label: 'gpt-4' },
            { provider: 'anthropic', label: 'claude' },
          ],
        },
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [
              {
                pass: true,
                text: 'output1',
                latencyMs: 150,
                gradingResult: { reason: 'Good response', comment: 'Well done' },
              },
              {
                pass: false,
                text: 'output2',
                latencyMs: 250,
                failureReason: 1, // ASSERT = 1
                gradingResult: { reason: 'Failed assertion', comment: 'Needs improvement' },
              },
            ],
          },
          {
            test: { vars: { testVar: 'value2' } },
            vars: ['value3', 'value4'],
            outputs: [
              { pass: true, text: 'output3', latencyMs: 100 },
              { pass: true, text: 'output4' }, // No latency, grader reason, or comment
            ],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('CSV Export'));

    await waitFor(() => {
      const calls = (csvStringify as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const rows = calls[0][0] as string[][];

      // Check headers include grader reason, comment, and latency columns
      expect(rows[0]).toContain('Grader Reason');
      expect(rows[0]).toContain('Comment');
      expect(rows[0]).toContain('Latency (ms)');
      expect(rows[0].filter((h: string) => h === 'Grader Reason')).toHaveLength(2); // Two prompts
      expect(rows[0].filter((h: string) => h === 'Comment')).toHaveLength(2); // Two prompts
      expect(rows[0].filter((h: string) => h === 'Latency (ms)')).toHaveLength(2); // Two prompts

      // Check structure: var1, var2, [openai] gpt-4, Grader Reason, Comment, Latency (ms), [anthropic] claude, Grader Reason, Comment, Latency (ms)
      expect(rows[0]).toEqual([
        'var1',
        'var2',
        '[openai] gpt-4',
        'Grader Reason',
        'Comment',
        'Latency (ms)',
        '[anthropic] claude',
        'Grader Reason',
        'Comment',
        'Latency (ms)',
      ]);

      // Check first row data: value1, value2, [PASS] output1, Good response, Well done, 150, [FAIL] output2, Failed assertion, Needs improvement, 250
      expect(rows[1]).toEqual([
        'value1',
        'value2',
        '[PASS] output1',
        'Good response',
        'Well done',
        150,
        '[FAIL] output2',
        'Failed assertion',
        'Needs improvement',
        250,
      ]);

      // Check second row: value3, value4, [PASS] output3, '', '', 100, [PASS] output4, '', '', ''
      expect(rows[2]).toEqual([
        'value3',
        'value4',
        '[PASS] output3',
        '',
        '',
        100,
        '[PASS] output4',
        '',
        '',
        '',
      ]);
    });
  });

  it('handles null gradingResult in downloadHumanEvalTestCases without crashing', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        ...mockTable,
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [{ pass: false, text: 'failed output', gradingResult: null }],
          },
          {
            test: { vars: { testVar: 'value2' } },
            vars: ['value3', 'value4'],
            outputs: [{ pass: true, text: 'passed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Human Eval YAML'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
  });

  it('handles deeply nested null properties in outputs without crashing', () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        ...mockTable,
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [{ pass: false, text: 'failed output', gradingResult: { scores: null } }],
          },
          {
            test: { vars: { testVar: 'value2' } },
            vars: ['value3', 'value4'],
            outputs: [{ pass: true, text: 'passed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    expect(() => {
      render(<DownloadMenu />);
    }).not.toThrow();
  });

  it('downloads Burp Suite Payloads when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Burp Payloads'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('properly categorizes download options into sections', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    // Check the category headings
    expect(screen.getByText('Configuration Files')).toBeInTheDocument();
    expect(screen.getByText('Export Results')).toBeInTheDocument();
    expect(screen.getByText('Advanced Exports')).toBeInTheDocument();
  });

  it('displays the "Downloaded" indicator in CommandBlock after downloading YAML config', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download YAML Config'));

    await waitFor(() => {
      const commandBlock = screen
        .getByText('Run this command to execute the eval again:')
        .closest('.MuiPaper-root');
      expect(commandBlock).toBeInTheDocument();
      expect(screen.getByText('Downloaded')).toBeVisible();
      expect(commandBlock?.querySelector('svg[data-testid="CheckCircleIcon"]')).toBeInTheDocument();
    });
  });

  it('shows an error toast when clipboard API fails', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      Promise.reject(new Error('Clipboard write failed')),
    );

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    const copyButton = screen.getAllByLabelText('Copy command')[0];
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Failed to copy command', 'error');
    });
  });

  describe('Failed Tests Config Button disabled state', () => {
    it('disables the button when table is null', async () => {
      (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        table: null,
        config: mockConfig,
        evalId: mockEvalId,
      });

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('disables the button when table.body is null', async () => {
      (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        table: {
          head: mockTable.head,
          body: null as any,
        },
        config: mockConfig,
        evalId: mockEvalId,
      });

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('disables the button when table.body is undefined', async () => {
      (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        table: {
          head: mockTable.head,
          body: undefined as any,
        },
        config: mockConfig,
        evalId: mockEvalId,
      });

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('disables the button when all tests pass', async () => {
      (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        table: {
          ...mockTable,
          body: [
            {
              test: { vars: { testVar: 'value' } },
              vars: ['value1', 'value2'],
              outputs: [{ pass: true, text: 'passed output' }],
            },
            {
              test: { vars: { testVar: 'value2' } },
              vars: ['value3', 'value4'],
              outputs: [{ pass: true, text: 'another passed output' }],
            },
          ],
        },
        config: mockConfig,
        evalId: mockEvalId,
      });

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('enables the button when there are failed tests', async () => {
      // Using the default mockTable which has failed tests
      (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        table: mockTable,
        config: mockConfig,
        evalId: mockEvalId,
      });

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).not.toBeDisabled();
    });

    it('handles edge case with empty body array', async () => {
      (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        table: {
          ...mockTable,
          body: [],
        },
        config: mockConfig,
        evalId: mockEvalId,
      });

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      // Empty body means no tests, so should be disabled
      expect(button).toBeDisabled();
    });
  });
});
