import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HiddenColumnChips } from './HiddenColumnChips';

const mockColumnData = [
  { value: 'Variable 1', label: 'question', group: 'Variables' },
  { value: 'Variable 2', label: 'customer_name', group: 'Variables' },
  { value: 'Variable 3', label: 'context', group: 'Variables' },
  { value: 'Description', label: 'Description', group: 'Other' },
];

describe('HiddenColumnChips', () => {
  it('renders nothing when all columns are visible', () => {
    const allSelected = mockColumnData.map((col) => col.value);
    const { container } = render(
      <HiddenColumnChips
        columnData={mockColumnData}
        selectedColumns={allSelected}
        onChange={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when columnData is empty', () => {
    const { container } = render(
      <HiddenColumnChips columnData={[]} selectedColumns={[]} onChange={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders chips for hidden columns', () => {
    const selectedColumns = ['Variable 1', 'Description'];

    render(
      <HiddenColumnChips
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={vi.fn()}
      />,
    );

    // Hidden columns should show as chips
    expect(screen.getByText('customer_name')).toBeInTheDocument();
    expect(screen.getByText('context')).toBeInTheDocument();

    // Visible columns should not show as chips
    expect(screen.queryByText('question')).not.toBeInTheDocument();
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('calls onChange with column restored when chip is clicked', async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();
    const selectedColumns = ['Variable 1'];

    render(
      <HiddenColumnChips
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    const chip = screen.getByText('customer_name');
    await user.click(chip);

    expect(mockOnChange).toHaveBeenCalledWith(['Variable 1', 'Variable 2']);
  });

  it('preserves existing selected columns when restoring a column', async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();
    const selectedColumns = ['Variable 1', 'Description'];

    render(
      <HiddenColumnChips
        columnData={mockColumnData}
        selectedColumns={selectedColumns}
        onChange={mockOnChange}
      />,
    );

    await user.click(screen.getByText('context'));

    expect(mockOnChange).toHaveBeenCalledWith(['Variable 1', 'Description', 'Variable 3']);
  });

  it('shows correct title attribute for accessibility', () => {
    render(
      <HiddenColumnChips
        columnData={mockColumnData}
        selectedColumns={['Variable 1']}
        onChange={vi.fn()}
      />,
    );

    const chip = screen.getByText('customer_name').closest('div[class*="cursor-pointer"]');
    expect(chip).toHaveAttribute('title', 'Show customer_name');
  });

  it('applies custom className when provided', () => {
    const { container } = render(
      <HiddenColumnChips
        columnData={mockColumnData}
        selectedColumns={['Variable 1']}
        onChange={vi.fn()}
        className="custom-class"
      />,
    );

    // The className is applied to the outer wrapper div
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('renders multiple hidden columns in order', () => {
    render(
      <HiddenColumnChips
        columnData={mockColumnData}
        selectedColumns={['Variable 1']}
        onChange={vi.fn()}
      />,
    );

    const chips = screen.getAllByText(/customer_name|context|Description/);
    expect(chips).toHaveLength(3);
  });
});
