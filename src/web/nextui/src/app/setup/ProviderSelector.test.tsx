import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ProviderSelector from './ProviderSelector';

const mockProviders = [
  { id: 'provider1', config: { temperature: 0.5 } },
  { id: 'provider2', config: { temperature: 0.75 } },
];

const mockOnChange = vi.fn();

describe('ProviderSelector', () => {
  beforeEach(() => {
    render(<ProviderSelector providers={mockProviders} onChange={mockOnChange} />);
  });

  it('renders the component correctly', () => {
    expect(screen.getByPlaceholderText('Select LLM providers')).toBeInTheDocument();
  });

  it('displays the correct number of providers', () => {
    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(mockProviders.length);
  });

  it('calls onChange when a provider is selected', () => {
    const providerToSelect = mockProviders[0].id;
    fireEvent.change(screen.getByPlaceholderText('Select LLM providers'), {
      target: { value: providerToSelect },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Select LLM providers'), { key: 'Enter' });

    expect(mockOnChange).toHaveBeenCalledWith([
      { id: 'provider1', config: { temperature: 0.5 } },
      { id: 'provider2', config: { temperature: 0.75 } },
      { id: 'provider1' }, // This is the selected provider without config
    ]);
  });

  it('opens the config dialog when a provider is clicked', () => {
    const providerChip = screen.getByText(mockProviders[0].id);
    fireEvent.click(providerChip);
    expect(screen.getByText('Click a provider to configure its settings.')).toBeInTheDocument();
  });

  it('closes the config dialog when Cancel is clicked', async () => {
    const providerChip = screen.getByText(mockProviders[0].id);
    fireEvent.click(providerChip);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(
      () => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
