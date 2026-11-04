import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PresetCard from './PresetCard';

describe('PresetCard', () => {
  it.each(['{Enter}', ' '])(
    'selects a focused preset with %s without submitting its form',
    async (key) => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const onSubmit = vi.fn((event) => event.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <PresetCard
            name="Standard"
            description="Recommended plugins"
            isSelected={false}
            onClick={onSelect}
          />
        </form>,
      );

      const preset = screen.getByRole('button', { name: /Standard/ });
      await user.tab();
      expect(preset).toHaveFocus();
      await user.keyboard(key);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('exposes selection state and supports pointer selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <PresetCard
        name="Standard"
        description="Recommended plugins"
        isSelected={false}
        onClick={onSelect}
      />,
    );
    const preset = screen.getByRole('button', { name: /Standard/ });
    expect(preset).toHaveAttribute('aria-pressed', 'false');
    await user.click(preset);
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(
      <PresetCard
        name="Standard"
        description="Recommended plugins"
        isSelected
        onClick={onSelect}
      />,
    );
    expect(preset).toHaveAttribute('aria-pressed', 'true');
  });
});
