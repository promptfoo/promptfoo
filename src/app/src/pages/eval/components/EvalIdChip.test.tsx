import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    expect(screen.getByText('ID:')).toBeInTheDocument();
    expect(screen.getByText('test-eval-id-123')).toBeInTheDocument();
  });

  it('displays the fingerprint icon', () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    expect(screen.getByTestId('FingerprintIcon')).toBeInTheDocument();
  });

  it('displays the copy icon button', () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    expect(screen.getByLabelText('Copy Eval ID')).toBeInTheDocument();
  });

  it('calls onCopy when the copy button is clicked', async () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    await userEvent.click(screen.getByLabelText('Copy Eval ID'));
    expect(mockOnCopy).toHaveBeenCalledTimes(1);
  });

  it('displays a tooltip on hover', async () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    await userEvent.hover(screen.getByLabelText('Copy Eval ID'));
    // Radix tooltip renders both visible content and an accessibility span with the same text
    const tooltips = await screen.findAllByText('Copy ID');
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('has hover:bg-muted class for hover state', () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    const box = screen.getByText('ID:').closest('div');
    expect(box).toHaveClass('hover:bg-muted');
  });
});
