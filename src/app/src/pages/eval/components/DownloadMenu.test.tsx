import { screen } from '@testing-library/dom';
import { fireEvent, render, waitFor } from '@testing-library/react';
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

  it('generates a CSV file with valid outputs when table data contains null or undefined outputs', async () => {
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
    await userEvent.click(screen.getByText('Download Table CSV'));

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
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
    await userEvent.click(screen.getByText('Download Human Eval Test YAML'));

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

  describe('Failed Tests Config Button disabled state', () => {
    it('disables the button when table is null', async () => {
      (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        table: null,
        config: mockConfig,
        evalId: mockEvalId,
      });

      render(<DownloadMenu />);
      await userEvent.click(screen.getByText('Download'));

      const button = screen.getByRole('button', { name: /Download Failed Tests Config/i });
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

      const button = screen.getByRole('button', { name: /Download Failed Tests Config/i });
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

      const button = screen.getByRole('button', { name: /Download Failed Tests Config/i });
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

      const button = screen.getByRole('button', { name: /Download Failed Tests Config/i });
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

      const button = screen.getByRole('button', { name: /Download Failed Tests Config/i });
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

      const button = screen.getByRole('button', { name: /Download Failed Tests Config/i });
      // Empty body means no tests, so should be disabled
      expect(button).toBeDisabled();
    });
  });
});
