import { mockBrowserProperty, mockClipboard, mockObjectUrl } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/dom';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadDialog } from './DownloadMenu';
import { useTableStore as useResultsViewStore } from './store';

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

const { fetchEvalConfigMock, fetchEvalResultDetailMock, prefetchEvalConfigMock } = vi.hoisted(
  () => ({
    fetchEvalConfigMock: vi.fn(),
    fetchEvalResultDetailMock: vi.fn(),
    prefetchEvalConfigMock: vi.fn(),
  }),
);

vi.mock('../../../hooks/useDownloadEval', () => ({
  downloadBlob: downloadBlobMock,
  DownloadFormat: {
    CSV: 'csv',
    JSON: 'json',
  },
  useDownloadEval: useDownloadEvalMock,
}));

vi.mock('../../../utils/api', () => ({
  fetchEvalConfig: fetchEvalConfigMock,
  fetchEvalResultDetail: fetchEvalResultDetailMock,
  prefetchEvalConfig: prefetchEvalConfigMock,
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
    mockClipboard();
    mockObjectUrl('mocked-blob-url');
    mockBrowserProperty(global.navigator, 'msSaveOrOpenBlob', vi.fn());

    yamlDumpMock.mockClear();
    yamlDumpMock.mockReturnValue('mocked yaml');
    fetchEvalConfigMock.mockReset();
    fetchEvalConfigMock.mockResolvedValue({ config: mockConfig });
    prefetchEvalConfigMock.mockReset();
    prefetchEvalConfigMock.mockResolvedValue(null);
    fetchEvalResultDetailMock.mockReset();
    fetchEvalResultDetailMock.mockResolvedValue({
      testCase: { vars: { prompt: 'detail prompt', testVar: 'detail value' } },
      text: 'detail output',
      metadata: { redteamFinalPrompt: 'detail final prompt' },
    });

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

  it('downloads CSV when clicking the button', async () => {
    renderDownloadDialog();
    // Hook options should be set after component renders
    expect(csvHookOptions?.onSuccess).toBeInstanceOf(Function);
    await userEvent.click(screen.getByText('Download Results CSV'));

    await waitFor(() => {
      expect(mockDownloadCsvFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('downloads Table JSON when clicking the button', async () => {
    renderDownloadDialog();
    // Hook options should be set after component renders
    expect(jsonHookOptions?.onSuccess).toBeInstanceOf(Function);
    await userEvent.click(screen.getByText('Download Results JSON'));

    await waitFor(() => {
      expect(mockDownloadJsonFn).toHaveBeenCalledWith(mockEvalId);
    });
  });

  it('shows loading state while CSV download is in progress', async () => {
    csvIsLoading = true;

    renderDownloadDialog();

    const csvButton = screen.getByRole('button', { name: 'Downloading...' });
    expect(csvButton).toBeDisabled();
  });

  it('shows loading state while JSON download is in progress', async () => {
    jsonIsLoading = true;

    renderDownloadDialog();

    const jsonButton = screen.getByRole('button', { name: 'Downloading...' });
    expect(jsonButton).toBeDisabled();
  });

  it('downloads DPO JSON when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('hydrates DPO exports from result detail when table rows are lean', async () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: {
        head: {
          vars: ['prompt'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: { description: 'lean row' },
            vars: ['lean prompt'],
            outputs: [
              { id: 'output-1', pass: false, text: '[content omitted: 120000 characters]' },
            ],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });
    fetchEvalResultDetailMock.mockResolvedValueOnce({
      testCase: { vars: { prompt: 'full prompt from detail' } },
      text: 'full output from detail',
      metadata: {},
    });

    renderDownloadDialog();
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), `${mockEvalId}-dpo.json`);
    });

    expect(fetchEvalResultDetailMock).toHaveBeenCalledWith(mockEvalId, 'output-1');
    const blob = downloadBlobMock.mock.calls[0][0] as Blob;
    const exported = JSON.parse(await blob.text());
    expect(exported).toEqual([
      {
        chosen: [],
        rejected: ['full output from detail'],
        vars: { prompt: 'full prompt from detail' },
        providers: ['provider1'],
        prompts: ['label1'],
      },
    ]);
  });

  it('falls back to lean table data when DPO detail hydration fails', async () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: {
        head: {
          vars: ['prompt'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: { vars: { prompt: 'lean prompt from test' } },
            vars: ['lean prompt from vars'],
            outputs: [
              {
                id: 'output-1',
                pass: false,
                text: '[content omitted: 120000 characters]',
              },
            ],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });
    fetchEvalResultDetailMock.mockRejectedValueOnce(new Error('Detail unavailable'));

    renderDownloadDialog();
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), `${mockEvalId}-dpo.json`);
    });

    const blob = downloadBlobMock.mock.calls[0][0] as Blob;
    const exported = JSON.parse(await blob.text());
    expect(exported).toEqual([
      {
        chosen: [],
        rejected: ['[content omitted: 120000 characters]'],
        vars: { prompt: 'lean prompt from test' },
        providers: ['provider1'],
        prompts: ['label1'],
      },
    ]);
    expect(showToastMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to export'),
      'error',
    );
    expect(showToastMock).toHaveBeenCalledWith(
      'Export used table data for 1 result because full result details could not be loaded.',
      'warning',
    );
  });

  it('skips detail fetches during DPO export when lean table rows are intact', async () => {
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: {
        head: {
          vars: ['prompt'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: { vars: { prompt: 'lean prompt' } },
            vars: ['lean prompt'],
            outputs: [{ id: 'output-1', pass: false, text: 'full lean output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    renderDownloadDialog();
    await userEvent.click(screen.getByText('DPO JSON'));

    await waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), `${mockEvalId}-dpo.json`);
    });
    expect(fetchEvalResultDetailMock).not.toHaveBeenCalled();

    const blob = downloadBlobMock.mock.calls[0][0] as Blob;
    const exported = JSON.parse(await blob.text());
    expect(exported).toEqual([
      {
        chosen: [],
        rejected: ['full lean output'],
        vars: { prompt: 'lean prompt' },
        providers: ['provider1'],
        prompts: ['label1'],
      },
    ]);
  });

  it('downloads Human Eval Test YAML when clicking the button', async () => {
    renderDownloadDialog();
    await userEvent.click(screen.getByText('Human Eval YAML'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('hydrates failed-test configs from full config and result detail', async () => {
    const fullConfig = {
      ...mockConfig,
      defaultTest: { options: { provider: 'full-default' } },
      tests: [{ vars: { prompt: 'original test' } }],
    };
    const fullFailedTest = {
      vars: { prompt: 'full failed prompt' },
      assert: [{ type: 'contains', value: 'expected' }],
      metadata: { id: 'full-test' },
    };
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: {
        head: {
          vars: ['prompt'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: { description: 'lean failed test' },
            vars: ['lean prompt'],
            outputs: [{ id: 'failed-output', pass: false, text: 'failed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });
    fetchEvalConfigMock.mockResolvedValueOnce({ config: fullConfig });
    fetchEvalResultDetailMock.mockResolvedValueOnce({
      testCase: fullFailedTest,
      text: 'full failed output',
      metadata: {},
    });

    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download Failed Tests'));

    await waitFor(() => {
      expect(yamlDumpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTest: fullConfig.defaultTest,
          tests: [fullFailedTest],
        }),
        { skipInvalid: true },
      );
    });
    expect(fetchEvalConfigMock).toHaveBeenCalledWith(mockEvalId);
    expect(fetchEvalResultDetailMock).toHaveBeenCalledWith(mockEvalId, 'failed-output');
  });

  it('falls back to lean failed-test rows when detail hydration fails', async () => {
    const fullConfig = {
      ...mockConfig,
      defaultTest: { options: { provider: 'full-default' } },
      tests: [{ vars: { prompt: 'original test' } }],
    };
    const leanFailedTest = {
      vars: { prompt: 'lean failed prompt' },
      assert: [{ type: 'contains', value: 'lean expected' }],
    };
    vi.mocked(useResultsViewStore).mockReturnValue({
      table: {
        head: {
          vars: ['prompt'],
          prompts: [{ provider: 'provider1', label: 'label1' }],
        },
        body: [
          {
            test: leanFailedTest,
            vars: ['lean failed prompt'],
            outputs: [{ id: 'failed-output', pass: false, text: 'failed output' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });
    fetchEvalConfigMock.mockResolvedValueOnce({ config: fullConfig });
    fetchEvalResultDetailMock.mockRejectedValueOnce(new Error('Detail unavailable'));

    renderDownloadDialog();
    await userEvent.click(screen.getByText('Download Failed Tests'));

    await waitFor(() => {
      expect(yamlDumpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTest: fullConfig.defaultTest,
          tests: [leanFailedTest],
        }),
        { skipInvalid: true },
      );
    });
    expect(showToastMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to export'),
      'error',
    );
    expect(showToastMock).toHaveBeenCalledWith(
      'Export used table data for 1 result because full result details could not be loaded.',
      'warning',
    );
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
