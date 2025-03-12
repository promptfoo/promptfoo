import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuthorChip } from './AuthorChip';

describe('AuthorChip', () => {
  const mockOnEditAuthor = vi.fn(() => Promise.resolve());
  const defaultProps = {
    author: 'test@example.com',
    onEditAuthor: mockOnEditAuthor,
    currentUserEmail: 'user@example.com',
    editable: true,
  };

  beforeEach(() => {
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
    mockOnEditAuthor.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    render(<AuthorChip {...defaultProps} />);
    await userEvent.click(screen.getByText('test@example.com'));
    await userEvent.click(screen.getByText('Save'));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
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
});
