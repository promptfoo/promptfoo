import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvidersListSection } from './ProvidersListSection';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('./AddProviderDialog', () => ({
  default: vi.fn(({ open, availableProviders }) =>
    open ? (
      <div data-testid="mock-add-provider-dialog">
        {availableProviders?.map((p: ProviderOptions) => p.id).join(',') ?? 'built-in-catalog'}
      </div>
    ) : null,
  ),
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

  it('disables provider creation until the server catalog is ready', () => {
    const { rerender } = render(
      <ProvidersListSection providers={[]} onChange={onChange} isProviderCatalogReady={false} />,
    );

    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDisabled();

    // The second Add Provider button (rendered once providers exist) gates too.
    rerender(
      <ProvidersListSection
        providers={providers}
        onChange={onChange}
        isProviderCatalogReady={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDisabled();
  });

  it('disables existing-provider edits until the server catalog is ready', () => {
    render(
      <ProvidersListSection
        providers={providers}
        onChange={onChange}
        isProviderCatalogReady={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit Primary model' })).toBeDisabled();
    expect(screen.queryByTestId('mock-add-provider-dialog')).not.toBeInTheDocument();
  });

  it('fails closed when a custom catalog has no valid providers', () => {
    render(
      <ProvidersListSection
        providers={[]}
        onChange={onChange}
        availableProviders={[]}
        isProviderCatalogReady={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDisabled();
    expect(screen.getByText('No valid providers are configured.')).toBeInTheDocument();
  });

  it('offers a retry when the catalog request failed, in both list states', async () => {
    const user = userEvent.setup();
    const onRetryProviderCatalog = vi.fn();

    const { rerender } = render(
      <ProvidersListSection
        providers={[]}
        onChange={onChange}
        isProviderCatalogReady={false}
        onRetryProviderCatalog={onRetryProviderCatalog}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryProviderCatalog).toHaveBeenCalledTimes(1);

    // The retry affordance is attached to the shared control, so it is present once
    // providers exist too - not only in the empty state.
    rerender(
      <ProvidersListSection
        providers={providers}
        onChange={onChange}
        isProviderCatalogReady={false}
        onRetryProviderCatalog={onRetryProviderCatalog}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryProviderCatalog).toHaveBeenCalledTimes(2);
  });

  it('does not offer a retry while the catalog is still loading or already loaded', () => {
    const { rerender } = render(
      <ProvidersListSection providers={[]} onChange={onChange} isProviderCatalogReady={false} />,
    );
    // Loading: gated, but no failure to recover from yet.
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    rerender(
      <ProvidersListSection
        providers={[]}
        onChange={onChange}
        isProviderCatalogReady={true}
        onRetryProviderCatalog={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('forwards the configured catalog to the add provider dialog', async () => {
    const user = userEvent.setup();
    const availableProviders: ProviderOptions[] = [
      { id: 'http://llm-gateway.internal', label: 'Approved Gateway' },
    ];

    render(
      <ProvidersListSection
        providers={[]}
        onChange={onChange}
        availableProviders={availableProviders}
        isProviderCatalogReady={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(screen.getByTestId('mock-add-provider-dialog')).toHaveTextContent(
      'http://llm-gateway.internal',
    );
  });

  it('forwards the configured catalog to the edit provider dialog', async () => {
    const user = userEvent.setup();
    const availableProviders: ProviderOptions[] = [
      { id: 'http://llm-gateway.internal', label: 'Approved Gateway' },
    ];

    render(
      <ProvidersListSection
        providers={providers}
        onChange={onChange}
        availableProviders={availableProviders}
        isProviderCatalogReady={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit Primary model' }));

    // A restricted catalog must also constrain the edit flow - otherwise
    // Edit -> Back reopens the unrestricted built-in selector.
    expect(screen.getByTestId('mock-add-provider-dialog')).toHaveTextContent(
      'http://llm-gateway.internal',
    );
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
