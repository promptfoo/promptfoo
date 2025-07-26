import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import ProviderConfigDialog from './ProviderConfigDialog';
import * as providerSchemas from '@app/schemas/providerSchemas';

// Mock the provider schemas module
vi.mock('@app/schemas/providerSchemas', () => ({
  getProviderSchema: vi.fn(),
  validateProviderConfig: vi.fn(),
  FieldSchema: {} // Add type export
}));

describe('ProviderConfigDialog', () => {
  const defaultProps = {
    open: true,
    providerId: 'openai:gpt-4',
    config: {
      apiKey: 'test-key',
      temperature: 0.7,
      max_tokens: 1024,
    },
    onClose: vi.fn(),
    onSave: vi.fn(),
  };

  const mockSchema = {
    fields: [
      {
        name: 'apiKey',
        type: 'string' as const,
        label: 'API Key',
        description: 'Authentication key',
        required: true,
        sensitive: true,
        defaultValue: '',
      },
      {
        name: 'temperature',
        type: 'number' as const,
        label: 'Temperature',
        description: 'Controls randomness',
        validation: { min: 0, max: 2 },
        defaultValue: 0.7,
      },
      {
        name: 'max_tokens',
        type: 'number' as const,
        label: 'Max Tokens',
        description: 'Maximum tokens',
        defaultValue: 1024,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (providerSchemas.getProviderSchema as Mock).mockReturnValue(mockSchema);
    (providerSchemas.validateProviderConfig as Mock).mockReturnValue({ 
      valid: true, 
      errors: [] 
    });
  });

  it('renders provider configuration dialog', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
    expect(screen.getByText('openai:gpt-4')).toBeInTheDocument();
  });

  it('displays form editor by default when schema exists', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Form' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'JSON' })).toBeInTheDocument();
    
    // Check that the schema mock was called
    expect(providerSchemas.getProviderSchema).toHaveBeenCalledWith('openai:gpt-4');
    
    // Check for form fields - they should exist even with initial values
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Tokens')).toBeInTheDocument();
  });

  it('displays JSON editor when no schema exists', () => {
    (providerSchemas.getProviderSchema as Mock).mockReturnValue(null);
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText(/No configuration schema available/)).toBeInTheDocument();
    expect(screen.getByLabelText('Configuration JSON')).toBeInTheDocument();
  });

  it('handles sensitive fields with visibility toggle', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    // API Key should be a password field
    const passwordInputs = screen.getAllByDisplayValue('test-key');
    const apiKeyInput = passwordInputs[0] as HTMLInputElement;
    
    expect(apiKeyInput).toBeInTheDocument();
    expect(apiKeyInput.type).toBe('password');

    // Find the visibility toggle button using a more specific selector
    const visibilityButtons = screen.getAllByRole('button');
    const visibilityButton = visibilityButtons.find(btn => 
      btn.querySelector('svg[data-testid="VisibilityIcon"]') || 
      btn.querySelector('svg[data-testid="VisibilityOffIcon"]')
    );
    
    expect(visibilityButton).toBeInTheDocument();
    fireEvent.click(visibilityButton!);

    expect(apiKeyInput.type).toBe('text');
  });

  it('validates configuration before saving', () => {
    // Create a new test that starts with empty config to trigger validation
    const propsWithEmptyConfig = {
      ...defaultProps,
      config: {},
    };
    
    (providerSchemas.validateProviderConfig as Mock).mockReturnValue({ 
      valid: false, 
      errors: ['API Key is required'] 
    });

    render(<ProviderConfigDialog {...propsWithEmptyConfig} />);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    
    // Save button should be disabled due to validation errors
    expect(saveButton).toBeDisabled();
    
    // Check that error appears (use getAllByText since it appears in both alert and field)
    const errors = screen.getAllByText('API Key is required');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('saves valid configuration', async () => {
    // First mock returns initial validation result, then mock valid for save
    (providerSchemas.validateProviderConfig as Mock)
      .mockReturnValueOnce({ valid: false, errors: ['API Key is required'] }) // Initial load
      .mockReturnValue({ valid: true, errors: [] }); // After change and save
    
    render(<ProviderConfigDialog {...defaultProps} />);

    const temperatureInput = screen.getByLabelText('Temperature');
    fireEvent.change(temperatureInput, { target: { value: '0.9' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith(
        'openai:gpt-4',
        expect.objectContaining({
          apiKey: 'test-key',
          temperature: 0.9,
          max_tokens: 1024,
        }),
      );
    });
  });

  it('switches between form and JSON editor', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    // Initially in form mode
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument();

    const jsonTab = screen.getByRole('tab', { name: 'JSON' });
    fireEvent.click(jsonTab);

    // Should show JSON editor
    expect(screen.getByLabelText('Configuration JSON')).toBeInTheDocument();
    
    // Form fields should not be visible
    expect(screen.queryByLabelText('Temperature')).not.toBeInTheDocument();
  });

  it('validates Azure deployment_id requirement', () => {
    const azureSchema = {
      fields: [
        {
          name: 'deployment_id',
          type: 'string' as const,
          label: 'Deployment ID',
          required: true,
          defaultValue: '',
        },
      ],
    };

    (providerSchemas.getProviderSchema as Mock).mockReturnValue(azureSchema);
    (providerSchemas.validateProviderConfig as Mock).mockReturnValue({ 
      valid: false, 
      errors: ['Deployment ID is required'] 
    });

    const azureProps = {
      ...defaultProps,
      providerId: 'azure:chat:gpt-4',
      config: {},
    };

    render(<ProviderConfigDialog {...azureProps} />);

    // Check for required field by looking for the input
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
    
    // With validation errors shown, the save button should be disabled
    const errors = screen.getAllByText('Deployment ID is required');
    expect(errors.length).toBeGreaterThan(0);
    
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });

  it('handles JSON editor errors gracefully', async () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    const jsonTab = screen.getByRole('tab', { name: 'JSON' });
    fireEvent.click(jsonTab);

    await waitFor(() => {
      const jsonInput = screen.getByLabelText('Configuration JSON');
      fireEvent.change(jsonInput, { target: { value: 'invalid json' } });
    });

    // The JsonTextField component should handle the error
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });

  it('cleans up empty values before saving', async () => {
    // Mock valid validation
    (providerSchemas.validateProviderConfig as Mock).mockReturnValue({ 
      valid: true, 
      errors: [] 
    });
    
    render(<ProviderConfigDialog {...defaultProps} />);

    const maxTokensInput = screen.getByLabelText('Max Tokens');
    fireEvent.change(maxTokensInput, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith(
        'openai:gpt-4',
        expect.objectContaining({
          apiKey: 'test-key',
          temperature: 0.7,
          // max_tokens should not be present
        }),
      );
      
      // Verify max_tokens was removed
      const savedConfig = defaultProps.onSave.mock.calls[0][1];
      expect(savedConfig).not.toHaveProperty('max_tokens');
    });
  });

  it('initializes fields with default values from schema', () => {
    const schemaWithDefaults = {
      fields: [
        {
          name: 'model',
          type: 'string' as const,
          label: 'Model',
          defaultValue: 'gpt-4',
        },
      ],
    };

    (providerSchemas.getProviderSchema as Mock).mockReturnValue(schemaWithDefaults);

    render(<ProviderConfigDialog {...defaultProps} config={{}} />);

    const modelInput = screen.getByLabelText('Model') as HTMLInputElement;
    expect(modelInput.value).toBe('gpt-4');
  });
});