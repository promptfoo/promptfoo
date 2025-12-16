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
const mockDownloadCsvFn = vi.fn();
const mockDownloadJsonFn = vi.fn();
let csvHookOptions:
  | { onSuccess?: (fileName: string) => void; onError?: (error: Error) => void }
  | undefined;
let jsonHookOptions:
  | { onSuccess?: (fileName: string) => void; onError?: (error: Error) => void }
  | undefined;
let csvIsLoading = false;
let jsonIsLoading = false;

const { downloadBlobMock, useDownloadEvalMock } = vi.hoisted(() => ({
  downloadBlobMock: vi.fn(),
  useDownloadEvalMock: vi.fn(),
}));

vi.mock('../../../hooks/useDownloadEval', () => ({
  downloadBlob: downloadBlobMock,
  DownloadFormat: {
    CSV: 'csv',
    JSON: 'json',
  },
  useDownloadEval: useDownloadEvalMock,
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
    csvIsLoading = false;
    jsonIsLoading = false;
    csvHookOptions = undefined;
    jsonHookOptions = undefined;

    yamlDumpMock.mockClear();
    yamlDumpMock.mockReturnValue('mocked yaml');

    downloadBlobMock.mockReset();
    downloadBlobMock.mockImplementation((blob: Blob, fileName: string) => {
      const url = global.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      global.URL.revokeObjectURL(url);
    });

    mockDownloadCsvFn.mockReset();
    mockDownloadCsvFn.mockImplementation(async () => {
      csvHookOptions?.onSuccess?.(`${mockEvalId}.csv`);
      return `${mockEvalId}.csv`;
    });

    mockDownloadJsonFn.mockReset();
    mockDownloadJsonFn.mockImplementation(async () => {
      jsonHookOptions?.onSuccess?.(`${mockEvalId}.json`);
      return `${mockEvalId}.json`;
    });

    useDownloadEvalMock.mockReset();
    useDownloadEvalMock.mockImplementation(
      (
        format: string,
        options?: { onSuccess?: (fileName: string) => void; onError?: (error: Error) => void },
      ) => {
        if (format === 'csv') {
          csvHookOptions = options;
          return { download: mockDownloadCsvFn, isLoading: csvIsLoading };
        }
        jsonHookOptions = options;
        return { download: mockDownloadJsonFn, isLoading: jsonIsLoading };
      },
    );

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
    expect(csvHookOptions?.onSuccess).toBeInstanceOf(Function);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads Table JSON when clicking the button', async () => {
    render(<DownloadMenu />);
    expect(jsonHookOptions?.onSuccess).toBeInstanceOf(Function);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Results JSON'));

    await waitFor(() => {
      expect(mockDownloadJsonFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('shows loading state while CSV download is in progress', async () => {
    csvIsLoading = true;

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    const csvButton = screen.getByRole('button', { name: 'Downloading...' });
    expect(csvButton).toBeDisabled();
  });

  it('shows loading state while JSON download is in progress', async () => {
    jsonIsLoading = true;

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    const jsonButton = screen.getByRole('button', { name: 'Downloading...' });
    expect(jsonButton).toBeDisabled();
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

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
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

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
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
    vi.mocked(useResultsViewStore).mockReturnValue({
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
    vi.mocked(navigator.clipboard.writeText).mockImplementationOnce(() =>
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
      vi.mocked(useResultsViewStore).mockReturnValue({
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
      vi.mocked(useResultsViewStore).mockReturnValue({
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
      vi.mocked(useResultsViewStore).mockReturnValue({
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

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

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

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

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

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests/i });
      // Empty body means no tests, so should be disabled
      expect(button).toBeDisabled();
    });
  });
});
