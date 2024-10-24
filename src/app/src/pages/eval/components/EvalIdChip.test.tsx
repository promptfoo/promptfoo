import { render, screen } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EvalIdChip } from './EvalIdChip';

describe('EvalIdChip', () => {
  const mockOnCopy = vi.fn();
  const defaultProps = {
    evalId: 'test-eval-id-123',
    onCopy: mockOnCopy,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with the correct eval ID', () => {
    render(<EvalIdChip {...defaultProps} />);
    expect(screen.getByText('ID:')).toBeInTheDocument();
    expect(screen.getByText('test-eval-id-123')).toBeInTheDocument();
  });

  it('displays the fingerprint icon', () => {
    render(<EvalIdChip {...defaultProps} />);
    expect(screen.getByTestId('FingerprintIcon')).toBeInTheDocument();
  });

  it('displays the copy icon button', () => {
    render(<EvalIdChip {...defaultProps} />);
    expect(screen.getByLabelText('Copy Eval ID')).toBeInTheDocument();
  });

  it('calls onCopy when the copy button is clicked', async () => {
    render(<EvalIdChip {...defaultProps} />);
    await userEvent.click(screen.getByLabelText('Copy Eval ID'));
    expect(mockOnCopy).toHaveBeenCalledTimes(1);
  });

  it('displays a tooltip on hover', async () => {
    render(<EvalIdChip {...defaultProps} />);
    await userEvent.hover(screen.getByLabelText('Copy Eval ID'));
    expect(await screen.findByText('Copy ID')).toBeInTheDocument();
  });

  it('changes background color on hover', async () => {
    render(<EvalIdChip {...defaultProps} />);
    const box = screen.getByText('ID:').closest('div');
    expect(box).toHaveStyle({ backgroundColor: '' });
    await userEvent.hover(box!);
    expect(box).toHaveStyle({ backgroundColor: 'action.hover' });
  });
});
