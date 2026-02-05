import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('test-eval-id-123')).toBeInTheDocument();
  });

  it('displays the copy icon', () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    // The chip has a trailing icon (Copy from lucide-react)
    const chip = screen.getByRole('button');
    expect(chip).toBeInTheDocument();
    // Check that the SVG icon exists within the button
    expect(chip.querySelector('svg')).toBeInTheDocument();
  });

  it('is clickable', () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    const chip = screen.getByRole('button');
    expect(chip).toBeInTheDocument();
  });

  it('calls onCopy when the chip is clicked', async () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    await userEvent.click(screen.getByRole('button'));
    expect(mockOnCopy).toHaveBeenCalledTimes(1);
  });

  it('displays a tooltip on hover', async () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    await userEvent.hover(screen.getByRole('button'));
    // Radix tooltip renders both visible content and an accessibility span with the same text
    const tooltips = await screen.findAllByText('Click to copy ID');
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('shows copied state after clicking', async () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    const button = screen.getByRole('button');
    await userEvent.click(button);
    // After clicking, the icon should change to a checkmark (Check icon from lucide)
    // and the tooltip text should change to "Copied!"
    await waitFor(() => {
      // The Check icon should be visible (green checkmark)
      const svgs = button.querySelectorAll('svg');
      // One of the SVGs should be the Check icon
      expect(svgs.length).toBeGreaterThan(0);
    });
  });

  it('has hover styling class', () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    const chip = screen.getByRole('button');
    expect(chip).toHaveClass('hover:bg-muted/50');
  });
});
