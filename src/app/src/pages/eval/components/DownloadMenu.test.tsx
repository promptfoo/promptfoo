import { render, fireEvent, waitFor } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DownloadMenu from './DownloadMenu';
import { useStore as useResultsViewStore } from './store';

// Get a reference to the mock
const showToastMock = vi.fn();

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

vi.mock('./store', () => ({
  useStore: vi.fn(),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
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
        test: { vars: { testVar: 'value' } },
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

  it('closes the dialog when clicking outside', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    expect(screen.getByText('Download YAML Config')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Download YAML Config')).not.toBeInTheDocument();
    });
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
    await userEvent.click(screen.getByText('Download Table CSV'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('downloads Table JSON when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Table JSON'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('downloads DPO JSON when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download DPO JSON'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('downloads Human Eval Test YAML when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Human Eval Test YAML'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('does not handle keyboard shortcuts when dialog is closed', () => {
    render(<DownloadMenu />);

    fireEvent.keyDown(document, { key: '1' });
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows a toast when table data is not available', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: null,
      config: mockConfig,
      evalId: mockEvalId,
    });

    // Clear any previous calls to the mock
    showToastMock.mockClear();

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Table CSV'));

    expect(showToastMock).toHaveBeenCalledWith('No table data', 'error');
  });

  // New tests for additional functionality

  it('downloads failed tests config when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Failed Tests Config'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      expect(showToastMock).toHaveBeenCalledWith(
        expect.stringContaining('Downloaded config with'),
        'success',
      );
    });
  });

  it('shows command blocks with the correct commands', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    // Check the commands are displayed correctly
    expect(screen.getByText(`promptfoo eval -c ${mockEvalId}-config.yaml`)).toBeInTheDocument();
    expect(
      screen.getByText(`promptfoo eval -c ${mockEvalId}-failed-tests.yaml`),
    ).toBeInTheDocument();
  });

  it('copies command text to clipboard when clicking the copy button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    // Find the copy button next to the config command
    const copyButtons = screen.getAllByLabelText('Copy command');
    await userEvent.click(copyButtons[0]);

    // Check that the clipboard API was called with the correct text
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `promptfoo eval -c ${mockEvalId}-config.yaml`,
    );
    expect(showToastMock).toHaveBeenCalledWith('Command copied to clipboard', 'success');
  });

  it('shows the Downloaded indicator after downloading a file', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download YAML Config'));

    // After download, check that the "Downloaded" text appears
    expect(screen.getByText('Downloaded')).toBeInTheDocument();
  });

  it('closes the dialog when clicking the Close button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    // Verify dialog is open
    expect(screen.getByText('Download Options')).toBeInTheDocument();

    // Click the Close button and verify dialog closes
    await userEvent.click(screen.getByText('Close'));

    await waitFor(() => {
      expect(screen.queryByText('Download Options')).not.toBeInTheDocument();
    });
  });

  it('disables the Failed Tests Config button when there are no failed tests', async () => {
    // Mock a table with no failed tests
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: {
        ...mockTable,
        body: [
          {
            test: { vars: { testVar: 'value' } },
            vars: ['value1', 'value2'],
            outputs: [{ pass: true, text: 'all passed' }],
          },
        ],
      },
      config: mockConfig,
      evalId: mockEvalId,
    });

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    // Get the Failed Tests Config button and check if it's disabled
    const failedTestsButton = screen.getByText('Download Failed Tests Config');
    expect(failedTestsButton.closest('button')).toBeDisabled();
  });

  it('downloads Burp Suite Payloads when clicking the button', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Burp Suite Payloads'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });
  });

  it('properly categorizes download options into sections', async () => {
    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));

    // Check the category headings
    expect(screen.getByText('Promptfoo Configs')).toBeInTheDocument();
    expect(screen.getByText('Table Data')).toBeInTheDocument();
    expect(screen.getByText('Advanced Options')).toBeInTheDocument();
  });
});
