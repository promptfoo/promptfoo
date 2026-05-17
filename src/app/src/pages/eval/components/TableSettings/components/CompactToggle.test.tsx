import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CompactToggle from './CompactToggle';

describe('CompactToggle', () => {
  it('keeps the info button adjacent to the label instead of pushing it to the row edge', () => {
    renderWithProviders(
      <CompactToggle
        label="Sticky header"
        checked={false}
        onChange={vi.fn()}
        tooltipText="Keep the header fixed when scrolling"
      />,
    );

    const label = screen.getByText('Sticky header');

    expect(label).not.toHaveClass('flex-1');
  });

  it('does not toggle the setting when the info button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithProviders(
      <CompactToggle
        label="Sticky header"
        checked={false}
        onChange={onChange}
        tooltipText="Keep the header fixed when scrolling"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Information about Sticky header' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
