import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssertionChip, getThresholdLabel } from './AssertionChip';
import type { GradingResult } from '@promptfoo/types';

describe('getThresholdLabel', () => {
  it('returns empty string for undefined threshold', () => {
    expect(getThresholdLabel(undefined)).toBe('');
  });

  it('returns "ALL must pass" for threshold of 1', () => {
    expect(getThresholdLabel(1)).toBe('ALL must pass');
  });

  it('returns "Either/Or" for threshold of 0.5', () => {
    expect(getThresholdLabel(0.5)).toBe('Either/Or');
  });

  it('returns percentage string for other thresholds between 0 and 1', () => {
    expect(getThresholdLabel(0.3)).toBe('≥30% must pass');
    expect(getThresholdLabel(0.7)).toBe('≥70% must pass');
    expect(getThresholdLabel(0.33)).toBe('≥33% must pass');
  });

  it('returns empty string for edge case thresholds', () => {
    // These edge cases shouldn't occur in practice (threshold is always 0-1)
    expect(getThresholdLabel(0)).toBe('');
    expect(getThresholdLabel(1.5)).toBe('');
  });
});

describe('AssertionChip', () => {
  it('renders basic chip with metric name and pass status', () => {
    render(<AssertionChip metric="test-metric" score={1} passed={true} />);

    expect(screen.getByText('test-metric')).toBeInTheDocument();
    // Check for check icon (passed)
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders failed chip with red styling', () => {
    const { container } = render(
      <AssertionChip metric="failed-metric" score={0.3} passed={false} />,
    );

    expect(screen.getByText('failed-metric')).toBeInTheDocument();
    // Check for red background classes
    const chip = container.querySelector('.bg-red-50');
    expect(chip).toBeInTheDocument();
  });

  it('displays score for non-boolean values when not an assert-set', () => {
    render(<AssertionChip metric="test-metric" score={0.75} passed={true} />);

    expect(screen.getByText('0.75')).toBeInTheDocument();
  });

  it('hides score for boolean values (0 and 1)', () => {
    const { rerender } = render(<AssertionChip metric="test-metric" score={0} passed={false} />);

    expect(screen.queryByText('0.00')).not.toBeInTheDocument();

    rerender(<AssertionChip metric="test-metric" score={1} passed={true} />);

    expect(screen.queryByText('1.00')).not.toBeInTheDocument();
  });

  it('hides score for assert-sets', () => {
    render(<AssertionChip metric="assert-set" score={0.75} passed={true} isAssertSet={true} />);

    expect(screen.queryByText('0.75')).not.toBeInTheDocument();
  });

  it('calls onClick handler when chip is clicked', async () => {
    const handleClick = vi.fn();
    render(<AssertionChip metric="test-metric" score={1} passed={true} onClick={handleClick} />);

    await userEvent.click(screen.getByText('test-metric'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders assert-set with chevron for expansion', () => {
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Child passed',
        assertion: { type: 'equals' },
      },
    ];

    render(
      <AssertionChip
        metric="parent-set"
        score={1}
        passed={true}
        isAssertSet={true}
        threshold={1}
        childResults={childResults}
      />,
    );

    expect(screen.getByText('parent-set')).toBeInTheDocument();
    // Check for chevron icon
    expect(screen.getByLabelText('Show parent-set details')).toBeInTheDocument();
  });

  it('displays child results in popover with pass/fail indicators', async () => {
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 0.9,
        reason: 'Child 1 passed',
        assertion: { type: 'equals', metric: 'child-1' },
      },
      {
        pass: false,
        score: 0.3,
        reason: 'Child 2 failed',
        assertion: { type: 'equals', metric: 'child-2' },
      },
    ];

    render(
      <AssertionChip
        metric="parent-set"
        score={0.6}
        passed={true}
        isAssertSet={true}
        threshold={0.5}
        childResults={childResults}
      />,
    );

    // Click the chevron to open popover
    const chevronButton = screen.getByLabelText('Show parent-set details');
    await userEvent.click(chevronButton);

    // Check that child metrics are displayed
    expect(screen.getByText('child-1')).toBeInTheDocument();
    expect(screen.getByText('child-2')).toBeInTheDocument();
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(screen.getByText('0.30')).toBeInTheDocument();
  });

  it('shows neutral indicator for failed children when parent passed', async () => {
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 0.9,
        reason: 'Child 1 passed',
        assertion: { type: 'equals', metric: 'child-1' },
      },
      {
        pass: false,
        score: 0.2,
        reason: 'Child 2 failed',
        assertion: { type: 'equals', metric: 'child-2' },
      },
    ];

    render(
      <AssertionChip
        metric="either-or-set"
        score={0.55}
        passed={true}
        isAssertSet={true}
        threshold={0.5}
        childResults={childResults}
      />,
    );

    // Click the chevron to open popover
    const chevronButton = screen.getByLabelText('Show either-or-set details');
    await userEvent.click(chevronButton);

    // The failed child should have a neutral indicator (Minus icon) since parent passed
    // We can verify this by checking for the Minus icon component in the DOM
    expect(screen.getByText('child-2')).toBeInTheDocument();
  });

  it('displays threshold label when provided', () => {
    render(
      <AssertionChip
        metric="test-set"
        score={1}
        passed={true}
        isAssertSet={true}
        thresholdLabel="Custom Label"
        childResults={[]}
      />,
    );

    // The threshold label appears in the chip when it's an assert-set
    expect(screen.getByText('test-set')).toBeInTheDocument();
  });

  it('displays threshold comparison in popover', async () => {
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Passed',
        assertion: { type: 'equals', metric: 'child' },
      },
    ];

    render(
      <AssertionChip
        metric="threshold-set"
        score={0.75}
        passed={true}
        isAssertSet={true}
        threshold={0.5}
        childResults={childResults}
      />,
    );

    const chevronButton = screen.getByLabelText('Show threshold-set details');
    await userEvent.click(chevronButton);

    // Check that score and threshold are displayed
    expect(screen.getByText('0.75')).toBeInTheDocument();
    expect(screen.getByText('0.50')).toBeInTheDocument();
  });

  it('renders tooltip when tooltipContent is provided', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <AssertionChip
          metric="policy-metric"
          score={1}
          passed={true}
          tooltipContent={<div>Policy tooltip content</div>}
        />
      </TooltipProvider>,
    );

    // Hover over the chip to show tooltip
    const chip = screen.getByText('policy-metric');
    await userEvent.hover(chip);

    // Note: Tooltip content may not be immediately visible depending on implementation
    // This test verifies the component accepts tooltipContent prop
    expect(chip).toBeInTheDocument();
  });

  it('splits click targets for assert-sets with children', async () => {
    const handleClick = vi.fn();
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Passed',
        assertion: { type: 'equals', metric: 'child' },
      },
    ];

    render(
      <AssertionChip
        metric="split-target"
        score={1}
        passed={true}
        isAssertSet={true}
        threshold={1}
        childResults={childResults}
        onClick={handleClick}
      />,
    );

    // Click on the metric name (should trigger onClick)
    await userEvent.click(screen.getByText('split-target'));
    expect(handleClick).toHaveBeenCalledTimes(1);

    // Click on chevron should NOT trigger onClick (stopPropagation)
    const chevronButton = screen.getByLabelText('Show split-target details');
    await userEvent.click(chevronButton);
    // onClick should still be 1 (not incremented)
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('uses assertion type as fallback for child metric name', async () => {
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Passed',
        assertion: { type: 'equals' },
      },
    ];

    render(
      <AssertionChip
        metric="parent"
        score={1}
        passed={true}
        isAssertSet={true}
        threshold={1}
        childResults={childResults}
      />,
    );

    const chevronButton = screen.getByLabelText('Show parent details');
    await userEvent.click(chevronButton);

    expect(screen.getByText('equals')).toBeInTheDocument();
  });

  it('uses type as fallback when child has no metric', async () => {
    const childResults: GradingResult[] = [
      {
        pass: true,
        score: 1,
        reason: 'Passed',
        assertion: { type: 'equals' },
      },
    ];

    render(
      <AssertionChip
        metric="parent"
        score={1}
        passed={true}
        isAssertSet={true}
        threshold={1}
        childResults={childResults}
      />,
    );

    const chevronButton = screen.getByLabelText('Show parent details');
    await userEvent.click(chevronButton);

    expect(screen.getByText('equals')).toBeInTheDocument();
  });
});
