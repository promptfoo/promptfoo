import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvidersListSection } from './ProvidersListSection';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('./AddProviderDialog', () => ({
  default: vi.fn(() => null),
}));

describe('ProvidersListSection', () => {
  const providers: ProviderOptions[] = [
    { id: 'openai:gpt-4.1', label: 'Primary model' },
    { id: 'anthropic:messages:claude-sonnet-4', label: 'Comparison model' },
  ];
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for confirmation before deleting a provider', async () => {
    const user = userEvent.setup();
    render(<ProvidersListSection providers={providers} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Delete Primary model' }));

    expect(screen.getByRole('dialog', { name: 'Delete provider?' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the provider after deletion is confirmed', async () => {
    const user = userEvent.setup();
    render(<ProvidersListSection providers={providers} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Delete Primary model' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onChange).toHaveBeenCalledWith([providers[1]]);
  });
});
