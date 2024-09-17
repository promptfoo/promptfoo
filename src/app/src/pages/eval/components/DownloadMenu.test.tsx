import { render, fireEvent, waitFor } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DownloadMenu from './DownloadMenu';
import { useStore as useResultsViewStore } from './store';

vi.mock('./store', () => ({
  useStore: vi.fn(),
}));

vi.mock('js-yaml', () => ({
  default: {
    dump: vi.fn().mockReturnValue('mocked yaml'),
  },
}));

vi.mock('csv-stringify/sync', () => ({
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
        outputs: [{ pass: true, text: 'output text' }],
      },
    ],
  };

  const mockConfig = { someConfig: 'value' };
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

  it('shows an alert when table data is not available', async () => {
    (useResultsViewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      table: null,
      config: mockConfig,
      evalId: mockEvalId,
    });

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<DownloadMenu />);
    await userEvent.click(screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download Table CSV'));

    expect(alertMock).toHaveBeenCalledWith('No table data');
    alertMock.mockRestore();
  });
});
