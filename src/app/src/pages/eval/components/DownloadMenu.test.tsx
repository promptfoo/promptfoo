import { mockBrowserProperty, mockClipboard, mockObjectUrl } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/dom';
import { act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadDialog } from './DownloadMenu';
import { useTableStore as useResultsViewStore } from './store';

const createPassingTableRow = () => ({
  test: { vars: { testVar: 'value2' } },
  vars: ['value3', 'value4'],
  outputs: [{ pass: true, text: 'passed output' }],
});

// Helper to render DownloadDialog with open state
function renderDownloadDialog() {
  const onClose = vi.fn();
  const result = renderWithProviders(<DownloadDialog open={true} onClose={onClose} />);
  return { ...result, onClose };
}

// Get a reference to the mock
const showToastMock = vi.fn();

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
  useResultsViewSettingsStore: vi.fn(),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

const { mockDownloadCsvFn, mockDownloadJsonFn } = vi.hoisted(() => ({
  mockDownloadCsvFn: vi.fn(),
  mockDownloadJsonFn: vi.fn(),
}));

vi.mock('../../../utils/api/downloads', () => ({
  downloadResultsCsv: mockDownloadCsvFn,
  downloadResultsJson: mockDownloadJsonFn,
}));

const { yamlDumpMock } = vi.hoisted(() => ({
  yamlDumpMock: vi.fn().mockReturnValue('mocked yaml'),
}));

vi.mock('js-yaml', () => ({
  default: {
    dump: yamlDumpMock,
  },
  dump: yamlDumpMock,
}));

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
      createPassingTableRow(),
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
    mockClipboard();
    mockObjectUrl('mocked-blob-url');
    mockBrowserProperty(global.navigator, 'msSaveOrOpenBlob', vi.fn());

    yamlDumpMock.mockClear();
    yamlDumpMock.mockReturnValue('mocked yaml');

    mockDownloadCsvFn.mockReset().mockResolvedValue(new Blob(['csv results']));
    mockDownloadJsonFn.mockReset().mockResolvedValue(new Blob(['json results']));

    vi.mocked(useResultsViewStore).mockReturnValue({
      table: mockTable,
      config: mockConfig,
      evalId: mockEvalId,
    });

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog with download options', async () => {
    renderDownloadDialog();
    expect(screen.getByText('Download YAML Config')).toBeInTheDocument();
  });

  it('downloads YAML config when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download YAML Config'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('leaves the saved base path out of the downloaded YAML config', async () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: mockTable,
      config: { ...mockConfig, basePath: '/home/user/project' },
      evalId: mockEvalId,
    });

    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download YAML Config'));

    await waitFor(() => {
      expect(yamlDumpMock).toHaveBeenCalledTimes(1);
    });
    expect(yamlDumpMock.mock.calls[0][0]).toEqual(mockConfig);
  });

  it('downloads CSV when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
      expect(vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0]).toHaveAttribute(
        'download',
        `${mockEvalId}.csv`,
      );
      expect(showToastMock).toHaveBeenCalledWith('CSV downloaded successfully', 'success');
    });
  });

  it('downloads Table JSON when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download Results JSON'));

    await waitFor(() => {
      expect(mockDownloadJsonFn).toHaveBeenCalledWith(mockEvalId);
      expect(vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0]).toHaveAttribute(
        'download',
        `${mockEvalId}.json`,
      );
      expect(showToastMock).toHaveBeenCalledWith('JSON downloaded successfully', 'success');
    });
  });

  it('shows loading state while CSV download is in progress', async () => {
    let finish!: (blob: Blob) => void;
    mockDownloadCsvFn.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );

    renderDownloadDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Download Results CSV' }));
    const csvButton = screen.getByRole('button', { name: 'Downloading...' });
    expect(csvButton).toBeDisabled();
    await act(async () => finish(new Blob(['results'])));
    expect(csvButton).toBeEnabled();
  });

  it('shows loading state while JSON download is in progress', async () => {
    let finish!: (blob: Blob) => void;
    mockDownloadJsonFn.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );

    renderDownloadDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Download Results JSON' }));
    const jsonButton = screen.getByRole('button', { name: 'Downloading...' });
    expect(jsonButton).toBeDisabled();
    await act(async () => finish(new Blob(['results'])));
    expect(jsonButton).toBeEnabled();
  });

  it.each(['CSV', 'JSON'])('recovers after a failed %s download', async (format) => {
    (format === 'CSV' ? mockDownloadCsvFn : mockDownloadJsonFn).mockRejectedValueOnce(
      new Error('download failed'),
    );
    renderDownloadDialog();
    const button = screen.getByRole('button', { name: `Download Results ${format}` });
    await userEvent.click(button);
    expect(showToastMock).toHaveBeenCalledWith(
      `Failed to download ${format}: download failed`,
      'error',
    );
    expect(button).toBeEnabled();
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('clears loading when saving the downloaded blob throws', async () => {
    vi.mocked(global.URL.createObjectURL).mockImplementationOnce(() => {
      throw new Error('save failed');
    });
    renderDownloadDialog();
    const button = screen.getByRole('button', { name: 'Download Results CSV' });
    await userEvent.click(button);
    expect(showToastMock).toHaveBeenCalledWith('Failed to download CSV: save failed', 'error');
    expect(button).toBeEnabled();
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('downloads DPO JSON when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('downloads Human Eval Test YAML when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('Human Eval YAML'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('handles malformed output structures in DPO JSON export without crashing', async () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
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

    renderDownloadDialog();
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
  });

  it('shows a toast when evalId is not available', async () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: mockTable,
      config: mockConfig,
      evalId: null,
    });

    // Clear any previous calls to the mock
    showToastMock.mockClear();

    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download Results CSV'));

    expect(showToastMock).toHaveBeenCalledWith('No evaluation ID', 'error');
  });

  it('handles null gradingResult in downloadHumanEvalTestCases without crashing', async () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: {
        ...mockTable,
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [{ pass: false, text: 'failed output', gradingResult: null }],
          },
          createPassingTableRow(),
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    renderDownloadDialog();
    await userEvent.click(screen.getByText('Human Eval YAML'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
  });

  it('handles deeply nested null properties in outputs without crashing', () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: {
        ...mockTable,
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [{ pass: false, text: 'failed output', gradingResult: { scores: null } }],
          },
          createPassingTableRow(),
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    expect(() => {
      renderDownloadDialog();
    }).not.toThrow();
  });

  it('downloads Burp Suite Payloads when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('Burp Payloads'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('properly categorizes download options into sections', async () => {
    renderDownloadDialog();

    // Check the category headings
    expect(screen.getByText('Configuration Files')).toBeInTheDocument();
    expect(screen.getByText('Export Results')).toBeInTheDocument();
    expect(screen.getByText('Advanced Exports')).toBeInTheDocument();
  });

  it('displays the "Downloaded" indicator in CommandBlock after downloading YAML config', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download YAML Config'));

    await waitFor(() => {
      // Check for the "Downloaded" text which appears after download
      expect(screen.getByText('Downloaded')).toBeVisible();
    });
  });

  it('stacks command copy controls on narrow screens', () => {
    renderDownloadDialog();

    const copyButton = screen.getAllByLabelText('Copy command')[0];
    expect(copyButton.parentElement).toHaveClass(
      'flex-col',
      'items-stretch',
      'sm:flex-row',
      'sm:items-center',
    );
    expect(copyButton).toHaveClass('self-end', 'sm:self-auto');
  });

  it('shows an error toast when clipboard API fails', async () => {
    vi.mocked(navigator.clipboard.writeText).mockImplementationOnce(() =>
      Promise.reject(new Error('Clipboard write failed')),
    );

    renderDownloadDialog();

    const copyButton = screen.getAllByLabelText('Copy command')[0];
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Failed to copy command', 'error');
    });
  });

  describe('Failed Tests Config Button disabled state', () => {
    it('disables the button when table is null', async () => {
      vi.mocked(useResultsViewStore).mockReturnValue({
        table: null,
        config: mockConfig,
        evalId: mockEvalId,
      });

      renderDownloadDialog();

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('disables the button when table.body is null', async () => {
      vi.mocked(useResultsViewStore).mockReturnValue({
        table: {
          head: mockTable.head,
          body: null as any,
        },
        config: mockConfig,
        evalId: mockEvalId,
      });

      renderDownloadDialog();

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('disables the button when table.body is undefined', async () => {
      vi.mocked(useResultsViewStore).mockReturnValue({
        table: {
          head: mockTable.head,
          body: undefined as any,
        },
        config: mockConfig,
        evalId: mockEvalId,
      });

      renderDownloadDialog();

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('disables the button when all tests pass', async () => {
      vi.mocked(useResultsViewStore).mockReturnValue({
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

      renderDownloadDialog();

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).toBeDisabled();
    });

    it('enables the button when there are failed tests', async () => {
      // Using the default mockTable which has failed tests
      vi.mocked(useResultsViewStore).mockReturnValue({
        table: mockTable,
        config: mockConfig,
        evalId: mockEvalId,
      });

      renderDownloadDialog();

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      expect(button).not.toBeDisabled();
    });

    it('handles edge case with empty body array', async () => {
      vi.mocked(useResultsViewStore).mockReturnValue({
        table: {
          ...mockTable,
          body: [],
        },
        config: mockConfig,
        evalId: mockEvalId,
      });

      renderDownloadDialog();

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      // Empty body means no tests, so should be disabled
      expect(button).toBeDisabled();
    });
  });
});
