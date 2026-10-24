import { restoreTestTimers, useTestTimers } from '@app/tests/timers';
import { renderWithProviders } from '@app/utils/testutils';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  afterEach(() => {
    restoreTestTimers();
    vi.restoreAllMocks();
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

  it('changes to the check icon after copying and resets after two seconds', async () => {
    const timers = useTestTimers();
    const user = userEvent.setup({ advanceTimers: timers.advanceBy });
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button.querySelector('.lucide-copy')).toBeInTheDocument();
    await act(async () => {
      const click = user.click(button);
      await timers.advanceByAsync(0);
      await click;
    });
    expect(mockOnCopy).toHaveBeenCalledOnce();
    expect(button.querySelector('.lucide-check')).toBeInTheDocument();
    expect(button.querySelector('.lucide-copy')).not.toBeInTheDocument();
    act(() => timers.advanceBy(2000));
    expect(button.querySelector('.lucide-copy')).toBeInTheDocument();
    expect(button.querySelector('.lucide-check')).not.toBeInTheDocument();
  });

  it('has hover styling class', () => {
    renderWithProviders(<EvalIdChip {...defaultProps} />);
    const chip = screen.getByRole('button');
    expect(chip).toHaveClass('hover:bg-muted/50');
  });
});
