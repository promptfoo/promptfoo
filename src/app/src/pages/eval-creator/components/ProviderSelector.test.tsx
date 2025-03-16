import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ProviderSelector from './ProviderSelector';

vi.mock('../../../store/providersStore', () => ({
  useProvidersStore: vi.fn(() => ({
    customProviders: [],
    addCustomProvider: vi.fn(),
    removeCustomProvider: vi.fn(),
  })),
}));

const mockProviders = [
  { id: 'provider1', config: { temperature: 0.5 } },
  { id: 'provider2', config: { temperature: 0.75 } },
];

const mockOnChange = vi.fn();

describe('ProviderSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    render(<ProviderSelector providers={mockProviders} onChange={mockOnChange} />);
  });

  it('renders the component correctly', () => {
    expect(screen.getByPlaceholderText('Select LLM providers')).toBeInTheDocument();
  });

  it('displays the correct number of providers', () => {
    const chips = screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('MuiChip-root'));
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

  it('opens the local provider dialog when clicking the Reference Local Provider button', () => {
    const addButton = screen.getByText('Reference Local Provider');
    fireEvent.click(addButton);
    expect(screen.getByText('Add Local Provider')).toBeInTheDocument();
  });

  it('adds a local provider when submitting the dialog', async () => {
    const addButton = screen.getByText('Reference Local Provider');
    fireEvent.click(addButton);

    // Fill in the path
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/your/provider.py');
    fireEvent.change(pathInput, { target: { value: '/path/to/provider.py' } });

    // Click add button
    const submitButton = screen.getByText('Add Provider');
    fireEvent.click(submitButton);

    // Verify the provider was added
    expect(mockOnChange).toHaveBeenCalledWith([
      ...mockProviders,
      {
        id: 'file:///path/to/provider.py',
        config: {},
        label: 'provider.py',
      },
    ]);
  });

  it('shows validation error for invalid file extension', async () => {
    const addButton = screen.getByText('Reference Local Provider');
    fireEvent.click(addButton);

    // Fill in invalid path
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/your/provider.py');
    fireEvent.change(pathInput, { target: { value: '/path/to/provider.txt' } });

    // Click add button
    const submitButton = screen.getByText('Add Provider');
    fireEvent.click(submitButton);

    // Verify error message
    expect(
      screen.getByText('Only javascript, python, and go files are supported'),
    ).toBeInTheDocument();
  });

  it('saves provider config when editing through dialog', async () => {
    // Click the first provider chip to open config dialog
    const providerChip = screen.getByText(mockProviders[0].id);
    fireEvent.click(providerChip);

    // Find and modify a config field (assuming temperature exists)
    const temperatureInput = screen.getByLabelText(/temperature/i);
    fireEvent.change(temperatureInput, { target: { value: '0.8' } });

    // Save the config
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // Verify the onChange was called with updated config
    expect(mockOnChange).toHaveBeenCalledWith([
      { ...mockProviders[0], config: { temperature: 0.8 } },
      mockProviders[1],
    ]);
  });
});
