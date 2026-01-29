import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareMenuItem from './ShareMenuItem';

// Mock the API utility
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

// Mock the dropdown menu components to avoid context dependency
vi.mock('@app/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: vi.fn(({ children, disabled, onClick, className }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  )),
}));

// Mock the tooltip components
vi.mock('@app/components/ui/tooltip', () => ({
  Tooltip: vi.fn(({ children }) => <>{children}</>),
  TooltipTrigger: vi.fn(({ children }) => <>{children}</>),
  TooltipContent: vi.fn(({ children }) => <div data-testid="tooltip-content">{children}</div>),
}));

// Mock ShareModal to avoid testing it again
vi.mock('./ShareModal', () => ({
  default: vi.fn(({ open, onClose, evalId, onShare }) => {
    if (!open) {
      return null;
    }
    const handleShare = async () => {
      try {
        await onShare(evalId);
      } catch {
        // Error is expected in some tests, swallow it
      }
    };
    return (
      <div data-testid="share-modal">
        <span data-testid="modal-eval-id">{evalId}</span>
        <button type="button" onClick={onClose} data-testid="modal-close">
          Close
        </button>
        <button type="button" onClick={handleShare} data-testid="modal-share">
          Generate Share
        </button>
      </div>
    );
  }),
}));

describe('ShareMenuItem', () => {
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when IS_RUNNING_LOCALLY is true', () => {
    beforeEach(() => {
      vi.doMock('@app/constants', () => ({
        IS_RUNNING_LOCALLY: true,
      }));
    });

    it('shows disabled menu item while checking sharing status', async () => {
      // Never resolves to keep in loading state
      mockCallApi.mockImplementation(() => new Promise(() => {}));

      render(<ShareMenuItem evalId="test-eval-id" />);

      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      expect(menuItem).toBeDisabled();
    });

    it('shows enabled menu item when sharing is enabled', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: true,
          sharingEnabled: true,
        }),
      );

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });
    });

    it('shows disabled menu item with tooltip when sharing is not enabled', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: false,
          sharingEnabled: false,
        }),
      );

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      // The tooltip content should contain the default disabled reason
      expect(screen.getByText(/Sharing is not configured/i)).toBeInTheDocument();
    });

    it('shows auth error message when authentication fails', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: true,
          sharingEnabled: false,
          authError: 'Authentication failed. Please run `promptfoo auth login` to re-authenticate.',
        }),
      );

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      expect(screen.getByText(/Authentication failed/i)).toBeInTheDocument();
    });

    it('shows error message when API call fails', async () => {
      mockCallApi.mockResolvedValue(Response.json({ error: 'Server error' }, { status: 500 }));

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      expect(screen.getByText(/Failed to check sharing status/i)).toBeInTheDocument();
    });

    it('shows error message when API call throws', async () => {
      mockCallApi.mockRejectedValue(new Error('Network error'));

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      expect(screen.getByText(/Failed to check sharing status/i)).toBeInTheDocument();
    });

    it('opens share modal when clicking enabled share button', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: true,
          sharingEnabled: true,
        }),
      );

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      await userEvent.click(menuItem);

      await waitFor(() => {
        expect(screen.getByTestId('share-modal')).toBeInTheDocument();
        expect(screen.getByTestId('modal-eval-id')).toHaveTextContent('test-eval-id');
      });
    });

    it('rechecks sharing status when evalId changes', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: true,
          sharingEnabled: true,
        }),
      );

      const { rerender } = render(<ShareMenuItem evalId="eval-1" />);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/results/share/check-domain?id=eval-1');
      });

      rerender(<ShareMenuItem evalId="eval-2" />);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/results/share/check-domain?id=eval-2');
      });
    });
  });

  describe('when IS_RUNNING_LOCALLY is false', () => {
    beforeEach(() => {
      vi.doMock('@app/constants', () => ({
        IS_RUNNING_LOCALLY: false,
      }));
    });

    it('enables sharing without API check for non-local instances', async () => {
      // Import fresh module with mocked constant
      vi.resetModules();
      vi.doMock('@app/constants', () => ({
        IS_RUNNING_LOCALLY: false,
      }));

      const { default: ShareMenuItemNonLocal } = await import('./ShareMenuItem');

      render(<ShareMenuItemNonLocal evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      // Should not call API for non-local instances
      expect(mockCallApi).not.toHaveBeenCalled();
    });
  });

  describe('handleShare function', () => {
    it('calls share API and returns URL for local instances', async () => {
      const shareUrl = 'https://app.example.com/eval/test-eval-id';

      // First call is check-domain, second is share
      mockCallApi
        .mockResolvedValueOnce(
          Response.json({
            domain: 'localhost:3000',
            isCloudEnabled: true,
            sharingEnabled: true,
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            url: shareUrl,
          }),
        );

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      // Click to open modal
      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      await userEvent.click(menuItem);

      // Click the generate share button in the mock modal
      const shareButton = screen.getByTestId('modal-share');
      await userEvent.click(shareButton);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith(
          '/results/share',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ id: 'test-eval-id' }),
          }),
        );
      });
    });

    it('throws error when share API fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockCallApi
        .mockResolvedValueOnce(
          Response.json({
            domain: 'localhost:3000',
            isCloudEnabled: true,
            sharingEnabled: true,
          }),
        )
        .mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }));

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      // Click to open modal
      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      await userEvent.click(menuItem);

      // Click the generate share button in the mock modal
      const shareButton = screen.getByTestId('modal-share');
      await userEvent.click(shareButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to generate share URL:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('modal interactions', () => {
    it('closes modal when onClose is called', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: true,
          sharingEnabled: true,
        }),
      );

      render(<ShareMenuItem evalId="test-eval-id" />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      // Open modal
      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      await userEvent.click(menuItem);

      expect(screen.getByTestId('share-modal')).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByTestId('modal-close');
      await userEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('share-modal')).not.toBeInTheDocument();
      });
    });
  });
});
