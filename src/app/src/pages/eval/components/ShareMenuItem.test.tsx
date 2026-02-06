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
  DropdownMenuItem: vi.fn(({ children, disabled, onSelect, className }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => onSelect?.(e)}
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

describe('ShareMenuItem', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockOnClick = vi.fn();

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

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

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

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

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

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

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

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      expect(screen.getByText(/Authentication failed/i)).toBeInTheDocument();
    });

    it('shows error message when API call fails', async () => {
      mockCallApi.mockResolvedValue(Response.json({ error: 'Server error' }, { status: 500 }));

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      expect(screen.getByText(/Failed to check sharing status/i)).toBeInTheDocument();
    });

    it('shows error message when API call throws', async () => {
      mockCallApi.mockRejectedValue(new Error('Network error'));

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      expect(screen.getByText(/Failed to check sharing status/i)).toBeInTheDocument();
    });

    it('calls onClick when clicking enabled share button', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: true,
          sharingEnabled: true,
        }),
      );

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      await userEvent.click(menuItem);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when menu item is disabled', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: false,
          sharingEnabled: false,
        }),
      );

      render(<ShareMenuItem evalId="test-eval-id" onClick={mockOnClick} />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).toBeDisabled();
      });

      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      await userEvent.click(menuItem);

      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('rechecks sharing status when evalId changes', async () => {
      mockCallApi.mockResolvedValue(
        Response.json({
          domain: 'localhost:3000',
          isCloudEnabled: true,
          sharingEnabled: true,
        }),
      );

      const { rerender } = render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/results/share/check-domain?id=eval-1');
      });

      rerender(<ShareMenuItem evalId="eval-2" onClick={mockOnClick} />);

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

      render(<ShareMenuItemNonLocal evalId="test-eval-id" onClick={mockOnClick} />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      // Should not call API for non-local instances
      expect(mockCallApi).not.toHaveBeenCalled();
    });

    it('calls onClick when clicking share button on non-local instances', async () => {
      vi.resetModules();
      vi.doMock('@app/constants', () => ({
        IS_RUNNING_LOCALLY: false,
      }));

      const { default: ShareMenuItemNonLocal } = await import('./ShareMenuItem');

      render(<ShareMenuItemNonLocal evalId="test-eval-id" onClick={mockOnClick} />);

      await waitFor(() => {
        const menuItem = screen.getByRole('menuitem', { name: /share/i });
        expect(menuItem).not.toBeDisabled();
      });

      const menuItem = screen.getByRole('menuitem', { name: /share/i });
      await userEvent.click(menuItem);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });
});
