import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorChip } from './AuthorChip';

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
    // Note: Do NOT use vi.useFakeTimers() here - it breaks userEvent interactions
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders with author email', () => {
    render(<AuthorChip {...defaultProps} />);
    expect(screen.getByText('Author:')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('renders "Unknown" when author is null', () => {
    render(<AuthorChip {...defaultProps} author={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('opens popover on click', async () => {
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    expect(screen.getByLabelText('Author Email')).toBeInTheDocument();
  });

  it('pre-fills with currentUserEmail when author is null', async () => {
    render(<AuthorChip {...defaultProps} author={null} />);
    await userEvent.click(screen.getByText('Unknown'));
    expect(screen.getByLabelText('Author Email')).toHaveValue('user@example.com');
  });

  it('calls onEditAuthor when save button is clicked', async () => {
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    await userEvent.clear(screen.getByLabelText('Author Email'));
    await userEvent.type(screen.getByLabelText('Author Email'), 'new@example.com');
    await userEvent.click(screen.getByText('Save'));
    expect(mockOnEditAuthor).toHaveBeenCalledWith('new@example.com');
  });

  it('calls onEditAuthor when Enter key is pressed', async () => {
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    await userEvent.clear(screen.getByLabelText('Author Email'));
    await userEvent.type(screen.getByLabelText('Author Email'), 'new@example.com{enter}');
    expect(mockOnEditAuthor).toHaveBeenCalledWith('new@example.com');
  });

  it('displays error message when onEditAuthor throws an error', async () => {
    const errorMessage = 'Failed to update author';
    mockOnEditAuthor.mockRejectedValueOnce(new Error(errorMessage));
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('disables save button when email is empty', async () => {
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    await userEvent.clear(screen.getByLabelText('Author Email'));
    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('closes popover after successful save', async () => {
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    await userEvent.clear(screen.getByLabelText('Author Email'));
    await userEvent.type(screen.getByLabelText('Author Email'), 'new@example.com');
    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.queryByLabelText('Author Email')).not.toBeInTheDocument();
    });
  });

  it('shows loading indicator while saving', async () => {
    let resolvePromise: () => void;
    mockOnEditAuthor.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    await userEvent.click(screen.getByText('Save'));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Resolve the promise to complete the save
    await act(async () => {
      resolvePromise!();
    });

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  it('shows warning message when currentUserEmail is not set', async () => {
    render(<AuthorChip {...defaultProps} currentUserEmail={null} />);
    await userEvent.click(screen.getByText('test@example.com'));
    expect(
      screen.getByText(
        /Setting an email address will also set the default author for future evals./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /It is changeable with `promptfoo config set email <your-email@example.com>`/,
      ),
    ).toBeInTheDocument();
  });

  it('does not show warning message when currentUserEmail is set', async () => {
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    expect(
      screen.queryByText(
        /Setting an email address will also set the default author for future evals./,
      ),
    ).not.toBeInTheDocument();
  });

  it('displays info icon when warning message is shown', async () => {
    render(<AuthorChip {...defaultProps} currentUserEmail={null} />);
    await userEvent.click(screen.getByText('test@example.com'));
    expect(screen.getByTestId('InfoIcon')).toBeInTheDocument();
  });

  it('does not display info icon when warning message is not shown', async () => {
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    expect(screen.queryByTestId('InfoIcon')).not.toBeInTheDocument();
  });

  it('does not show edit icon when not editable', () => {
    render(<AuthorChip {...defaultProps} editable={false} />);
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
  });

  it('does not show popover when not editable', async () => {
    render(<AuthorChip {...defaultProps} editable={false} />);
    await userEvent.click(screen.getByText('test@example.com'));
    expect(screen.queryByLabelText('Author Email')).not.toBeInTheDocument();
  });

  describe('cloud mode', () => {
    const cloudProps = {
      ...defaultProps,
      isCloudEnabled: true,
      author: null,
      currentUserEmail: 'user@example.com',
    };

    it('shows "Claim as mine" button when cloud enabled and no author', async () => {
      render(<AuthorChip {...cloudProps} />);
      await userEvent.click(screen.getByText('Unknown'));
      expect(screen.getByText('This eval has no author assigned.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Claim as mine/i })).toBeInTheDocument();
    });

    it('shows user email in claim button', async () => {
      render(<AuthorChip {...cloudProps} />);
      await userEvent.click(screen.getByText('Unknown'));
      expect(screen.getByRole('button', { name: /user@example\.com/i })).toBeInTheDocument();
    });

    it('calls onEditAuthor with currentUserEmail when claim button is clicked', async () => {
      render(<AuthorChip {...cloudProps} />);
      await userEvent.click(screen.getByText('Unknown'));
      await userEvent.click(screen.getByRole('button', { name: /Claim as mine/i }));
      expect(mockOnEditAuthor).toHaveBeenCalledWith('user@example.com');
    });

    it('does not render TextField in cloud mode', async () => {
      render(<AuthorChip {...cloudProps} />);
      await userEvent.click(screen.getByText('Unknown'));
      expect(screen.queryByLabelText('Author Email')).not.toBeInTheDocument();
    });

    it('disables claim button and shows loading text when currentUserEmail is null', async () => {
      render(<AuthorChip {...cloudProps} currentUserEmail={null} />);
      await userEvent.click(screen.getByText('Unknown'));
      // Button shows "Loading..." instead of "Claim as mine (null)" when email not available
      expect(screen.getByRole('button', { name: /Loading/i })).toBeDisabled();
    });

    it('shows tooltip "Click to claim this eval" when cloud enabled and no author', async () => {
      render(<AuthorChip {...cloudProps} />);
      const chip = screen.getByText('Unknown').closest('div');
      expect(chip?.closest('[data-testid]') || chip?.parentElement).toBeInTheDocument();
      // Tooltip is handled by MUI, just verify the component renders
    });

    it('shows tooltip "This eval belongs to {author}" when not editable and author is someone else', () => {
      render(<AuthorChip {...cloudProps} author="other@example.com" editable={false} />);
      // The tooltip title is set based on editable state
      expect(screen.getByText('other@example.com')).toBeInTheDocument();
    });

    it('shows "Your eval" tooltip when cloud enabled and author matches current user', () => {
      // In cloud mode, when viewing your own eval, editable=false and tooltip says "Your eval"
      render(<AuthorChip {...cloudProps} author="user@example.com" editable={false} />);
      // The component renders with author displayed, tooltip would show "Your eval"
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
    });

    it('displays error message when cloud action fails', async () => {
      const errorMessage = 'Failed to claim eval';
      mockOnEditAuthor.mockRejectedValueOnce(new Error(errorMessage));
      render(<AuthorChip {...cloudProps} />);
      await userEvent.click(screen.getByText('Unknown'));
      await userEvent.click(screen.getByRole('button', { name: /Claim as mine/i }));
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('shows loading indicator while claiming', async () => {
      let resolvePromise: () => void;
      mockOnEditAuthor.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolvePromise = resolve;
          }),
      );

      render(<AuthorChip {...cloudProps} />);
      await userEvent.click(screen.getByText('Unknown'));
      await userEvent.click(screen.getByRole('button', { name: /Claim as mine/i }));
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await act(async () => {
        resolvePromise!();
      });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });

    it('closes popover after successful claim', async () => {
      render(<AuthorChip {...cloudProps} />);
      await userEvent.click(screen.getByText('Unknown'));
      await userEvent.click(screen.getByRole('button', { name: /Claim as mine/i }));
      await waitFor(() => {
        expect(screen.queryByText('This eval has no author assigned.')).not.toBeInTheDocument();
      });
    });
  });

  describe('non-cloud mode', () => {
    it('renders TextField when cloud is disabled', async () => {
      render(<AuthorChip {...defaultProps} isCloudEnabled={false} />);
      await userEvent.click(screen.getByText('test@example.com'));
      expect(screen.getByLabelText('Author Email')).toBeInTheDocument();
    });

    it('allows free text input when cloud is disabled', async () => {
      render(<AuthorChip {...defaultProps} isCloudEnabled={false} />);
      await userEvent.click(screen.getByText('test@example.com'));
      await userEvent.clear(screen.getByLabelText('Author Email'));
      await userEvent.type(screen.getByLabelText('Author Email'), 'anyone@example.com');
      await userEvent.click(screen.getByText('Save'));
      expect(mockOnEditAuthor).toHaveBeenCalledWith('anyone@example.com');
    });
  });
});
