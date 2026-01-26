import { BULK_RATING_CONSTANTS, useBulkRating } from '@app/hooks/useBulkRating';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkRatingDialog } from './BulkRatingDialog';

// Mock the useBulkRating hook
vi.mock('@app/hooks/useBulkRating', async () => {
  const actual = await vi.importActual<typeof import('@app/hooks/useBulkRating')>(
    '@app/hooks/useBulkRating',
  );
  return {
    ...actual,
    useBulkRating: vi.fn(),
  };
});

describe('BulkRatingDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    evalId: 'eval-123',
    filterMode: 'all' as const,
    filters: undefined,
    searchQuery: undefined,
    onSuccess: vi.fn(),
  };

  const mockHook = {
    bulkRate: vi.fn(),
    isLoading: false,
    fetchPreviewCount: vi.fn(),
    previewCount: 10,
    isLoadingPreview: false,
    previewError: null,
    clearPreviewError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBulkRating).mockReturnValue(mockHook);
    mockHook.fetchPreviewCount.mockResolvedValue(10);
    mockHook.bulkRate.mockResolvedValue({
      success: true,
      matched: 10,
      updated: 10,
      skipped: 0,
    });
  });

  describe('rendering', () => {
    it('renders dialog when open', () => {
      render(<BulkRatingDialog {...defaultProps} />);

      expect(screen.getByText('Bulk Rate Results')).toBeInTheDocument();
      expect(screen.getByText('Rating')).toBeInTheDocument();
      expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<BulkRatingDialog {...defaultProps} open={false} />);

      expect(screen.queryByText('Bulk Rate Results')).not.toBeInTheDocument();
    });

    it('displays preview count', () => {
      render(<BulkRatingDialog {...defaultProps} />);

      // Count and filter mode label are in the same span: "10 (all results)"
      expect(screen.getByText(/10.*all results/i)).toBeInTheDocument();
    });

    it('displays filter mode labels correctly', () => {
      const { rerender } = render(<BulkRatingDialog {...defaultProps} filterMode="failures" />);
      expect(screen.getByText(/failures only/i)).toBeInTheDocument();

      rerender(<BulkRatingDialog {...defaultProps} filterMode="passes" />);
      expect(screen.getByText(/passes only/i)).toBeInTheDocument();

      rerender(<BulkRatingDialog {...defaultProps} filterMode="errors" />);
      expect(screen.getByText(/errors only/i)).toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('shows loading spinner when fetching preview', () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        isLoadingPreview: true,
        previewCount: null,
      });

      render(<BulkRatingDialog {...defaultProps} />);

      // The spinner should be rendered (check for any element that indicates loading)
      expect(screen.getByRole('button', { name: /pass/i })).toBeDisabled();
    });

    it('disables submit button when loading', () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        isLoading: true,
      });

      render(<BulkRatingDialog {...defaultProps} />);

      expect(screen.getByText('Updating...')).toBeInTheDocument();
    });

    it('disables submit button when preview count is 0', () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        previewCount: 0,
      });

      render(<BulkRatingDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /pass 0 results/i })).toBeDisabled();
    });
  });

  describe('pass/fail selection', () => {
    it('defaults to pass selected', () => {
      render(<BulkRatingDialog {...defaultProps} />);

      const passRadio = screen.getByRole('radio', { name: /pass/i });
      expect(passRadio).toBeChecked();
    });

    it('allows switching to fail', async () => {
      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      const failRadio = screen.getByRole('radio', { name: /fail/i });
      await user.click(failRadio);

      expect(failRadio).toBeChecked();
      expect(screen.getByRole('button', { name: /fail 10 results/i })).toBeInTheDocument();
    });
  });

  describe('reason input', () => {
    it('allows entering a reason', async () => {
      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/enter a reason/i);
      await user.type(textarea, 'Test reason');

      expect(textarea).toHaveValue('Test reason');
    });

    it('shows label as optional', () => {
      render(<BulkRatingDialog {...defaultProps} />);

      expect(screen.getByText(/reason \(optional\)/i)).toBeInTheDocument();
    });
  });

  describe('confirmation threshold warning', () => {
    it('shows warning when preview count exceeds threshold', () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        previewCount: BULK_RATING_CONSTANTS.CONFIRMATION_THRESHOLD + 10,
      });

      render(<BulkRatingDialog {...defaultProps} />);

      expect(screen.getByText(/this will update/i)).toBeInTheDocument();
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    });

    it('does not show warning below threshold', () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        previewCount: BULK_RATING_CONSTANTS.CONFIRMATION_THRESHOLD - 1,
      });

      render(<BulkRatingDialog {...defaultProps} />);

      expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
    });
  });

  describe('preview error handling', () => {
    it('displays preview error', () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        previewError: 'Failed to fetch',
        previewCount: null,
      });

      render(<BulkRatingDialog {...defaultProps} />);

      expect(screen.getByText(/failed to fetch preview/i)).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('calls bulkRate with correct parameters on submit', async () => {
      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      // Enter reason
      const textarea = screen.getByPlaceholderText(/enter a reason/i);
      await user.type(textarea, 'Test reason');

      // Click submit
      const submitButton = screen.getByRole('button', { name: /pass 10 results/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockHook.bulkRate).toHaveBeenCalledWith({
          pass: true,
          reason: 'Test reason',
          filterMode: 'all',
          filters: undefined,
          searchQuery: undefined,
          confirmBulk: false,
        });
      });
    });

    it('sets confirmBulk when above threshold', async () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        previewCount: 100,
      });

      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /pass 100 results/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockHook.bulkRate).toHaveBeenCalledWith(
          expect.objectContaining({ confirmBulk: true }),
        );
      });
    });

    it('trims whitespace from reason', async () => {
      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/enter a reason/i);
      await user.type(textarea, '  trimmed reason  ');

      const submitButton = screen.getByRole('button', { name: /pass 10 results/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockHook.bulkRate).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'trimmed reason' }),
        );
      });
    });

    it('displays success message after successful submission', async () => {
      mockHook.bulkRate.mockResolvedValue({
        success: true,
        matched: 10,
        updated: 8,
        skipped: 2,
      });

      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /pass 10 results/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/updated 8 results/i)).toBeInTheDocument();
        expect(screen.getByText(/2 skipped/i)).toBeInTheDocument();
      });
    });

    it('displays error message on failure', async () => {
      mockHook.bulkRate.mockResolvedValue({
        success: false,
        matched: 0,
        updated: 0,
        skipped: 0,
        error: 'Operation failed',
      });

      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /pass 10 results/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('refreshes preview before submitting', async () => {
      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      // Wait for initial mount call
      await waitFor(() => {
        expect(mockHook.fetchPreviewCount).toHaveBeenCalledTimes(1);
      });

      const submitButton = screen.getByRole('button', { name: /pass 10 results/i });
      await user.click(submitButton);

      // Should call fetchPreviewCount again before bulkRate (twice total: mount + submit)
      await waitFor(() => {
        expect(mockHook.fetchPreviewCount).toHaveBeenCalledTimes(2);
      });
    });

    it('shows error when preview refresh fails', async () => {
      // Set up the mock to fail on the SECOND call (first call happens on mount)
      // First call succeeds (on mount), second call (on submit) fails
      mockHook.fetchPreviewCount
        .mockResolvedValueOnce(10) // Mount call
        .mockRejectedValueOnce(new Error('Network error')); // Submit refresh call

      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      // Wait for initial mount call to complete
      await waitFor(() => {
        expect(mockHook.fetchPreviewCount).toHaveBeenCalledTimes(1);
      });

      const submitButton = screen.getByRole('button', { name: /pass 10 results/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to verify result count/i)).toBeInTheDocument();
      });

      // bulkRate should not be called
      expect(mockHook.bulkRate).not.toHaveBeenCalled();
    });
  });

  describe('dialog actions', () => {
    it('calls onClose when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('does not allow closing while loading', async () => {
      vi.mocked(useBulkRating).mockReturnValue({
        ...mockHook,
        isLoading: true,
      });

      render(<BulkRatingDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeDisabled();
    });

    it('calls onSuccess and onClose after successful submission', async () => {
      // Use a shorter delay mock instead of fake timers to avoid timing issues
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      const user = userEvent.setup();
      render(<BulkRatingDialog {...defaultProps} onSuccess={onSuccess} onClose={onClose} />);

      const submitButton = screen.getByRole('button', { name: /pass 10 results/i });
      await user.click(submitButton);

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/updated 10 results/i)).toBeInTheDocument();
      });

      // Wait for the auto-close timeout (1500ms in component + some buffer)
      await waitFor(
        () => {
          expect(onSuccess).toHaveBeenCalled();
          expect(onClose).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('effect cleanup', () => {
    it('fetches preview when dialog opens', async () => {
      render(<BulkRatingDialog {...defaultProps} />);

      await waitFor(() => {
        expect(mockHook.fetchPreviewCount).toHaveBeenCalledWith('all', undefined, undefined);
      });
    });

    it('clears preview error when dialog opens', async () => {
      render(<BulkRatingDialog {...defaultProps} />);

      await waitFor(() => {
        expect(mockHook.clearPreviewError).toHaveBeenCalled();
      });
    });

    it('refetches when filter changes', async () => {
      const { rerender } = render(<BulkRatingDialog {...defaultProps} />);

      await waitFor(() => {
        expect(mockHook.fetchPreviewCount).toHaveBeenCalledTimes(1);
      });

      rerender(<BulkRatingDialog {...defaultProps} filterMode="failures" />);

      await waitFor(() => {
        expect(mockHook.fetchPreviewCount).toHaveBeenCalledWith('failures', undefined, undefined);
      });
    });
  });
});
