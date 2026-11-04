import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddProviderDialog from './AddProviderDialog';
import { ProvidersListSection } from './ProvidersListSection';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('./AddProviderDialog', () => ({
  default: vi.fn(() => null),
}));

const MockedAddProviderDialog = vi.mocked(AddProviderDialog);

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

  it('labels native Codex Security providers separately from OpenAI foundation models', () => {
    render(
      <ProvidersListSection
        providers={[
          {
            id: 'openai:codex-security:gpt-5.6-luna',
            label: 'Deep repository scan',
            config: { operation: 'deep-security-scan' },
          },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Codex Security SDK')).toBeInTheDocument();
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
  });

  it('forwards the configured catalog to both the add and edit dialogs', async () => {
    const user = userEvent.setup();
    const catalog: ProviderOptions[] = [{ id: 'openai:gpt-4o-mini' }];
    render(
      <ProvidersListSection
        providers={providers}
        onChange={onChange}
        availableProviders={catalog}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));
    expect(
      MockedAddProviderDialog.mock.calls.some(
        ([props]) => props.availableProviders === catalog && props.open === true,
      ),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Edit Primary model' }));
    expect(
      MockedAddProviderDialog.mock.calls.some(
        ([props]) =>
          props.availableProviders === catalog &&
          (props.initialProvider as ProviderOptions | undefined)?.id === 'openai:gpt-4.1',
      ),
    ).toBe(true);
  });

  it('leaves the dialogs unrestricted when no catalog is configured', async () => {
    const user = userEvent.setup();
    render(<ProvidersListSection providers={providers} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));
    const addProps = MockedAddProviderDialog.mock.calls.map(([props]) => props);
    expect(addProps.length).toBeGreaterThan(0);
    for (const props of addProps) {
      expect(props.availableProviders).toBeUndefined();
    }
  });
});
