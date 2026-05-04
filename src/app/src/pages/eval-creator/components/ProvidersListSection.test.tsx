import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProvidersListSection } from './ProvidersListSection';

vi.mock('./AddProviderDialog', () => ({
  default: () => null,
}));

describe('ProvidersListSection', () => {
  it('keeps provider cards responsive on small screens', () => {
    render(<ProvidersListSection providers={[{ id: 'openai:gpt-5.5' }]} onChange={vi.fn()} />);

    const providerLabel = screen.getAllByText('openai:gpt-5.5')[0];
    const card = providerLabel.closest('[class*="rounded"]');
    const actions = screen.getByRole('button', {
      name: 'Edit provider openai:gpt-5.5',
    }).parentElement;

    expect(card).toHaveClass('flex-col', 'items-stretch', 'sm:flex-row', 'sm:items-center');
    expect(actions).toHaveClass('self-end', 'sm:self-auto');
    expect(
      screen.getByRole('button', { name: 'Remove provider openai:gpt-5.5' }),
    ).toBeInTheDocument();
  });
});
