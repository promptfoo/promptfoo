import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorChip } from './AuthorChip';

// Mock useToast hook
const mockShowToast = vi.fn();
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

describe('AuthorChip', () => {
  const mockOnEditAuthor = vi.fn(() => Promise.resolve());
  const defaultProps = {
    author: 'test@example.com',
    onEditAuthor: mockOnEditAuthor,
    currentUserEmail: 'user@example.com',
    editable: true,
    isCloudEnabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders with author email', () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    expect(screen.getByText('AUTHOR')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('renders "Unknown" when author is null', () => {
    renderWithProviders(<AuthorChip {...defaultProps} author={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('opens a claim dialog instead of inline edit mode when cloud is enabled', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} author={null} isCloudEnabled />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Claim eval')).toBeInTheDocument();
    expect(screen.getByText('This eval has no author assigned.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
  });

  it('claims the eval with the current user email when cloud is enabled', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} author={null} isCloudEnabled />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button', { name: 'Claim as mine (user@example.com)' }));

    await waitFor(() => {
      expect(mockOnEditAuthor).toHaveBeenCalledWith('user@example.com');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps the cloud claim dialog open and shows an error when claim fails', async () => {
    mockOnEditAuthor.mockRejectedValueOnce(new Error('Claim failed'));
    renderWithProviders(<AuthorChip {...defaultProps} author={null} isCloudEnabled />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button', { name: 'Claim as mine (user@example.com)' }));

    await waitFor(() => {
      expect(screen.getByText('Claim failed')).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables the cloud claim action until the current user email is loaded', async () => {
    renderWithProviders(
      <AuthorChip {...defaultProps} currentUserEmail={null} author={null} isCloudEnabled />,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it('keeps non-editable cloud authors focusable so the ownership tooltip is reachable', async () => {
    renderWithProviders(
      <AuthorChip
        {...defaultProps}
        author="owner@example.com"
        currentUserEmail="user@example.com"
        editable={false}
        isCloudEnabled
      />,
    );

    const chip = screen.getByRole('button', { name: /authorowner@example.com/i });
    expect(chip).not.toBeDisabled();
    expect(chip).toHaveAttribute('aria-disabled', 'true');

    await userEvent.hover(chip);
    expect(await screen.findAllByText('This eval belongs to owner@example.com')).not.toHaveLength(
      0,
    );
  });

  it('opens inline edit mode on click', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    // Click on the chip to start editing
    await userEvent.click(screen.getByRole('button'));
    // Should show email input
    expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument();
  });

  it('pre-fills with currentUserEmail when author is null', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} author={null} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('email@example.com')).toHaveValue('user@example.com');
  });

  it('calls onEditAuthor when save button is clicked', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('email@example.com');
    await userEvent.clear(input);
    await userEvent.type(input, 'new@example.com');
    await userEvent.click(screen.getByLabelText('Save'));
    expect(mockOnEditAuthor).toHaveBeenCalledWith('new@example.com');
  });

  it('calls onEditAuthor when Enter key is pressed', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('email@example.com');
    await userEvent.clear(input);
    await userEvent.type(input, 'new@example.com{enter}');
    expect(mockOnEditAuthor).toHaveBeenCalledWith('new@example.com');
  });

  it('displays error message via toast when onEditAuthor throws an error', async () => {
    const errorMessage = 'Failed to update author';
    mockOnEditAuthor.mockRejectedValueOnce(new Error(errorMessage));
    renderWithProviders(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByLabelText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(errorMessage, 'error');
    });
  });

  it('cancels edit when cancel button is clicked', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByRole('button'));
    // Edit the input
    const input = screen.getByPlaceholderText('email@example.com');
    await userEvent.clear(input);
    await userEvent.type(input, 'new@example.com');
    // Click cancel
    await userEvent.click(screen.getByLabelText('Cancel'));
    // Should go back to chip display mode
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
    expect(mockOnEditAuthor).not.toHaveBeenCalled();
  });

  it('closes edit mode after successful save', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('email@example.com');
    await userEvent.clear(input);
    await userEvent.type(input, 'new@example.com');
    await userEvent.click(screen.getByLabelText('Save'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
    });
  });

  it('does not show edit icon when not editable', () => {
    renderWithProviders(<AuthorChip {...defaultProps} editable={false} />);
    // The chip should still render but without the pencil icon
    const chip = screen.getByRole('button');
    // Check that it doesn't have the pencil icon (only one SVG should be present or none for trailing icon)
    expect(chip).toBeInTheDocument();
  });

  it('does not enter edit mode when not editable', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} editable={false} />);
    await userEvent.click(screen.getByRole('button'));
    // Should not show the email input since not editable
    expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
  });

  it('shows tooltip with edit hint when editable', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    await userEvent.hover(screen.getByRole('button'));
    const tooltips = await screen.findAllByText('Click to edit author');
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('shows tooltip with set hint when author is null and editable', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} author={null} />);
    await userEvent.hover(screen.getByRole('button'));
    const tooltips = await screen.findAllByText('Click to set author');
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('cancels edit when Escape key is pressed', async () => {
    renderWithProviders(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('email@example.com');
    await userEvent.type(input, '{escape}');
    // Should go back to chip display mode
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
    });
  });
});
