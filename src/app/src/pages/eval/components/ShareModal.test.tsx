import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareModal from './ShareModal';

// Mock the API utility
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

// Mock document.execCommand for copy functionality
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

global.document.execCommand = vi.fn();

describe('ShareModal', () => {
  const mockOnClose = vi.fn();
  const mockOnShare = vi.fn();
  const mockCallApi = vi.mocked(callApi);

  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    evalId: 'test-eval-id',
    onShare: mockOnShare,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful domain check by default
    mockCallApi.mockResolvedValue(
      Response.json({
        domain: 'localhost:3000',
        isCloudEnabled: false,
      }),
    );
  });

  it('does not render when closed', () => {
    render(<ShareModal {...defaultProps} open={false} />);
    expect(screen.queryByText('Share Evaluation')).not.toBeInTheDocument();
  });

  it('shows loading state initially', async () => {
    mockOnShare.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Generating share link...')).toBeInTheDocument();
    });
  });

  it('displays signup prompt when cloud is not enabled', async () => {
    mockCallApi.mockResolvedValue(
      Response.json({
        domain: 'promptfoo.app',
        isCloudEnabled: false,
      }),
    );

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Share Evaluation')).toBeInTheDocument();
      expect(
        screen.getByText(/You need to be logged in to your Promptfoo cloud account/),
      ).toBeInTheDocument();
      expect(screen.getByText('Take me there')).toBeInTheDocument();
    });
  });

  it('displays share URL when successfully generated', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockOnShare.mockResolvedValue(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
      expect(screen.getByDisplayValue(testUrl)).toBeInTheDocument();
    });
  });

  it('handles copy to clipboard functionality', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockOnShare.mockResolvedValue(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(testUrl)).toBeInTheDocument();
    });

    const copyButton = screen.getByTestId('FileCopyIcon').closest('button');
    expect(copyButton).toBeInTheDocument();
    await userEvent.click(copyButton!);

    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('displays error when domain check fails', async () => {
    mockCallApi.mockResolvedValue(
      Response.json(
        {
          error: 'Domain check failed',
        },
        { status: 500 },
      ),
    );

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Domain check failed')).toBeInTheDocument();
    });
  });

  it('displays error when share URL generation fails', async () => {
    mockOnShare.mockRejectedValue(new Error('Failed to generate share URL'));

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to generate share URL')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockOnShare.mockResolvedValue(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
    });

    const closeButton = screen.getByText('Close');
    await userEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('opens external link when "Take me there" is clicked', async () => {
    mockCallApi.mockResolvedValue(
      Response.json({
        domain: 'promptfoo.app',
        isCloudEnabled: false,
      }),
    );

    // Mock window.open
    const mockOpen = vi.fn();
    vi.stubGlobal('open', mockOpen);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Take me there')).toBeInTheDocument();
    });

    const takeButton = screen.getByText('Take me there');
    await userEvent.click(takeButton);

    expect(mockOpen).toHaveBeenCalledWith('https://www.promptfoo.app', '_blank');
  });

  it('shows organization access message for shared URLs', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockOnShare.mockResolvedValue(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText('This URL is accessible to users with access to your organization.'),
      ).toBeInTheDocument();
    });
  });
});
