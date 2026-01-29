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
  const mockCallApi = vi.mocked(callApi);

  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    evalId: 'test-eval-id',
  };

  // Helper to mock successful share flow (domain check + share generation)
  const mockSuccessfulShare = (url: string) => {
    mockCallApi.mockImplementation((apiUrl: string) => {
      if (apiUrl.includes('check-domain')) {
        return Promise.resolve(
          Response.json({
            domain: 'localhost:3000',
            isCloudEnabled: false,
          }),
        );
      }
      // POST /results/share
      return Promise.resolve(Response.json({ url }));
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful domain check by default - must return fresh Response for each call
    // since Response body can only be consumed once
    mockCallApi.mockImplementation(() =>
      Promise.resolve(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: false,
        }),
      ),
    );
  });

  it('does not render when closed', () => {
    render(<ShareModal {...defaultProps} open={false} />);
    expect(screen.queryByText('Share Evaluation')).not.toBeInTheDocument();
  });

  it('shows loading state initially', async () => {
    // Make the domain check never resolve
    mockCallApi.mockImplementation(() => new Promise(() => {}));
    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Generating share link...')).toBeInTheDocument();
    });
  });

  it('displays signup prompt when cloud is not enabled', async () => {
    mockCallApi.mockImplementation(() =>
      Promise.resolve(
        Response.json({
          domain: 'promptfoo.app',
          isCloudEnabled: false,
        }),
      ),
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
    mockSuccessfulShare(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
      expect(screen.getByDisplayValue(testUrl)).toBeInTheDocument();
    });
  });

  it('handles copy to clipboard functionality', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockSuccessfulShare(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(testUrl)).toBeInTheDocument();
    });

    const copyButton = screen.getByLabelText('Copy share URL');
    expect(copyButton).toBeInTheDocument();
    await userEvent.click(copyButton);

    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('displays error when domain check fails', async () => {
    mockCallApi.mockImplementation(() =>
      Promise.resolve(
        Response.json(
          {
            error: 'Domain check failed',
          },
          { status: 500 },
        ),
      ),
    );

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Domain check failed')).toBeInTheDocument();
    });
  });

  it('displays error when share URL generation fails', async () => {
    mockCallApi.mockImplementation((url: string) => {
      if (url.includes('check-domain')) {
        return Promise.resolve(
          Response.json({
            domain: 'localhost:3000',
            isCloudEnabled: false,
          }),
        );
      }
      // POST /results/share fails
      return Promise.resolve(
        Response.json({ error: 'Failed to generate share URL' }, { status: 500 }),
      );
    });

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to generate share URL')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockSuccessfulShare(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
    });

    // There are two buttons with name "Close" - the visible text button and the X icon button with sr-only text
    // We want the visible text button which is the first one in the DOM
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    await userEvent.click(closeButtons[0]);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('opens external link when "Take me there" is clicked', async () => {
    mockCallApi.mockImplementation(() =>
      Promise.resolve(
        Response.json({
          domain: 'promptfoo.app',
          isCloudEnabled: false,
        }),
      ),
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
    mockSuccessfulShare(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText('This URL is accessible to users with access to your organization.'),
      ).toBeInTheDocument();
    });
  });

  it('always displays organization access message when share URL is present', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockSuccessfulShare(testUrl);

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
    });

    expect(
      screen.getByText('This URL is accessible to users with access to your organization.'),
    ).toBeInTheDocument();
  });

  it('skips signup prompt when isCloudEnabled is true', async () => {
    const testUrl = 'https://promptfoo.app/eval/test-id';
    mockCallApi.mockImplementation((url: string) => {
      if (url.includes('check-domain')) {
        return Promise.resolve(
          Response.json({
            domain: 'any-domain.com',
            isCloudEnabled: true,
          }),
        );
      }
      // POST /results/share
      return Promise.resolve(Response.json({ url: testUrl }));
    });

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
      expect(screen.getByDisplayValue(testUrl)).toBeInTheDocument();
      expect(
        screen.queryByText(/You need to be logged in to your Promptfoo cloud account/),
      ).not.toBeInTheDocument();
    });
  });

  it('handles missing domain in API response gracefully', async () => {
    mockCallApi.mockImplementation(() =>
      Promise.resolve(
        Response.json({
          isCloudEnabled: false,
        }),
      ),
    );

    render(<ShareModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to check share domain')).toBeInTheDocument();
    });
  });

  it('generates share URL for non-public domain without signup prompt', async () => {
    const testUrl = 'https://example.com/shared/test-eval-id';
    mockSuccessfulShare(testUrl);

    render(<ShareModal {...defaultProps} />);

    expect(screen.getByText('Generating share link...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
      expect(screen.getByDisplayValue(testUrl)).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/You need to be logged in to your Promptfoo cloud account/),
    ).toBeNull();
  });

  it('refetches domain check and generates new share URL when evalId changes', async () => {
    const testUrl1 = 'https://promptfoo.app/eval/test-id-1';
    const testUrl2 = 'https://promptfoo.app/eval/test-id-2';

    // Must return a fresh Response for each call since Response body can only be consumed once
    mockCallApi.mockImplementation((url: string) => {
      if (url.includes('check-domain')) {
        return Promise.resolve(
          Response.json({
            domain: 'localhost:3000',
            isCloudEnabled: false,
          }),
        );
      }
      // POST /results/share - return URL based on evalId in request body
      // Since we can't easily parse the body, just return different URLs based on call order
      return Promise.resolve(Response.json({ url: testUrl1 }));
    });

    const { rerender } = render(<ShareModal {...defaultProps} evalId="test-eval-id-1" />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
      expect(screen.getByDisplayValue(testUrl1)).toBeInTheDocument();
    });

    // Update mock to return second URL
    mockCallApi.mockImplementation((url: string) => {
      if (url.includes('check-domain')) {
        return Promise.resolve(
          Response.json({
            domain: 'localhost:3000',
            isCloudEnabled: false,
          }),
        );
      }
      return Promise.resolve(Response.json({ url: testUrl2 }));
    });

    rerender(<ShareModal {...defaultProps} evalId="test-eval-id-2" />);

    await waitFor(() => {
      expect(screen.getByText('Your eval is ready to share')).toBeInTheDocument();
      expect(screen.getByDisplayValue(testUrl2)).toBeInTheDocument();
    });
  });
});
