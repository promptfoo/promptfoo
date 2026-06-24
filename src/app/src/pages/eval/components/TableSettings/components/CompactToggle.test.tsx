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
    const infoButton = screen.getByRole('button', { name: 'Information about Sticky header' });

    expect(label.parentElement).toBe(infoButton.parentElement);
    expect(label.nextElementSibling).toBe(infoButton);
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

  it('toggles the setting when the row is clicked', async () => {
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

    await user.click(screen.getByRole('listitem'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles once when the checkbox is clicked directly', async () => {
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

    await user.click(screen.getByRole('checkbox', { name: 'Sticky header' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithProviders(
      <CompactToggle
        label="Sticky header"
        checked={false}
        disabled
        onChange={onChange}
        tooltipText="Keep the header fixed when scrolling"
      />,
    );

    await user.click(screen.getByRole('listitem'));
    await user.click(screen.getByRole('checkbox', { name: 'Sticky header' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('associates the checkbox with its visible label', () => {
    renderWithProviders(
      <CompactToggle
        label="Sticky header"
        checked={false}
        onChange={vi.fn()}
        tooltipText="Keep the header fixed when scrolling"
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Sticky header' });
    const labelledBy = checkbox.getAttribute('aria-labelledby');

    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)).toHaveTextContent('Sticky header');
  });
});
