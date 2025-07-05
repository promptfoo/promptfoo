import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DefaultTestVariables from './DefaultTestVariables';

// Mock the useRedTeamConfig hook
const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

describe('DefaultTestVariables Component', () => {
  const defaultConfig = {
    description: 'Test Configuration',
    plugins: [],
    strategies: [],
    purpose: 'Test purpose',
    numTests: 10,
    maxConcurrency: 4,
    target: { id: 'test-target', config: {} },
    applicationDefinition: {},
    entities: [],
  };

  const configWithVariables = {
    ...defaultConfig,
    defaultTest: {
      vars: {
        apiKey: 'test-key',
        language: 'en',
        endpoint: 'https://api.example.com',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updateConfig: mockUpdateConfig,
    });
  });

  describe('Initial Rendering', () => {
    it('renders Test Variables section with empty state', () => {
      render(<DefaultTestVariables />);

      expect(screen.getByText('Test Variables')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Set default variables that will be available across all test cases. Useful for parameterizing endpoints, API keys, language codes, etc.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Add Variable')).toBeInTheDocument();
      expect(screen.getByText('No test variables configured')).toBeInTheDocument();
      expect(
        screen.getByText('Optional variables that will be added to every test case'),
      ).toBeInTheDocument();
    });

    it('renders with existing variables', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      expect(screen.getByDisplayValue('apiKey')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-key')).toBeInTheDocument();
      expect(screen.getByDisplayValue('language')).toBeInTheDocument();
      expect(screen.getByDisplayValue('en')).toBeInTheDocument();
      expect(screen.getByDisplayValue('endpoint')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://api.example.com')).toBeInTheDocument();
    });

    it('shows proper empty state styling', () => {
      render(<DefaultTestVariables />);

      const emptyState = screen.getByText('No test variables configured').closest('div');
      expect(emptyState).toHaveClass('MuiBox-root');
    });
  });

  describe('Adding Variables', () => {
    it('adds new variable when Add Variable button is clicked', async () => {
      render(<DefaultTestVariables />);

      const addButton = screen.getByText('Add Variable');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: { newVar: '' },
        });
      });
    });

    it('generates unique variable names when adding multiple variables', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: { vars: { newVar: 'value1' } },
        },
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const addButton = screen.getByText('Add Variable');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: { newVar: 'value1', newVar1: '' },
        });
      });
    });
  });

  describe('Variable Management', () => {
    beforeEach(() => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });
    });

    it('updates variable name when typing in name field', async () => {
      render(<DefaultTestVariables />);

      const nameField = screen.getByDisplayValue('apiKey');
      fireEvent.change(nameField, { target: { value: 'newApiKey' } });

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: {
            newApiKey: 'test-key',
            language: 'en',
            endpoint: 'https://api.example.com',
          },
        });
      });
    });

    it('updates variable value when typing in value field', async () => {
      render(<DefaultTestVariables />);

      const valueField = screen.getByDisplayValue('test-key');
      fireEvent.change(valueField, { target: { value: 'new-test-key' } });

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: {
            apiKey: 'new-test-key',
            language: 'en',
            endpoint: 'https://api.example.com',
          },
        });
      });
    });

    it('removes variable when delete button is clicked', async () => {
      render(<DefaultTestVariables />);

      const deleteButtons = screen.getAllByTestId('DeleteIcon');
      expect(deleteButtons).toHaveLength(3);

      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: {
            language: 'en',
            endpoint: 'https://api.example.com',
          },
        });
      });
    });

    it('shows validation error when creating duplicate variable names', async () => {
      render(<DefaultTestVariables />);

      const nameField = screen.getByDisplayValue('apiKey');
      fireEvent.change(nameField, { target: { value: 'language' } });

      // Should show validation error for duplicate names
      await waitFor(() => {
        const errors = screen.getAllByText('Duplicate variable name');
        expect(errors).toHaveLength(2); // Both duplicates should show error
      });

      // Variables with validation errors should not be included in global state
      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: {
            endpoint: 'https://api.example.com',
          },
        });
      });
    });
  });

  describe('UI Elements', () => {
    it('has correct field labels and sizing', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const nameFields = screen.getAllByLabelText('Variable name');
      const valueFields = screen.getAllByLabelText('Value');

      expect(nameFields).toHaveLength(3);
      expect(valueFields).toHaveLength(3);

      nameFields.forEach((field) => {
        expect(field).toBeInTheDocument();
      });
      valueFields.forEach((field) => {
        expect(field).toBeInTheDocument();
      });
    });

    it('shows delete buttons for all variables', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const deleteButtons = screen.getAllByTestId('DeleteIcon');
      expect(deleteButtons).toHaveLength(3);

      deleteButtons.forEach((button) => {
        expect(button).toBeInTheDocument();
        expect(button.closest('button')).toHaveAttribute(
          'aria-label',
          expect.stringContaining('Delete variable'),
        );
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty defaultTest object', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: {},
        },
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      expect(screen.getByText('No test variables configured')).toBeInTheDocument();
    });

    it('handles undefined defaultTest', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: undefined,
        },
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      expect(screen.getByText('No test variables configured')).toBeInTheDocument();
    });

    it('handles adding variable to empty vars object', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: { vars: {} },
        },
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const addButton = screen.getByText('Add Variable');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: { newVar: '' },
        });
      });
    });

    it('handles variables with empty values', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: { vars: { testVar: '' } },
        },
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      // Should display the variable with empty value
      expect(screen.getByDisplayValue('testVar')).toBeInTheDocument();
      expect(screen.getByDisplayValue('')).toBeInTheDocument();
    });

    it('handles variable names with special characters', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const nameField = screen.getByDisplayValue('apiKey');
      fireEvent.change(nameField, { target: { value: 'invalid@#$ name' } });

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: {
            'invalid@#$ name': 'test-key',
            language: 'en',
            endpoint: 'https://api.example.com',
          },
        });
      });
    });

    it('filters out variables with empty names from global state', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const nameField = screen.getByDisplayValue('apiKey');
      fireEvent.change(nameField, { target: { value: '' } });

      // Variables with empty names should be filtered out from global state
      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: {
            language: 'en',
            endpoint: 'https://api.example.com',
          },
        });
      });
    });

    it('handles extremely long variable names and values', async () => {
      const longString = 'a'.repeat(5000);
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: { vars: { initialVar: 'initialValue' } },
        },
        updateConfig: mockUpdateConfig,
      });
      render(<DefaultTestVariables />);

      const nameField = screen.getByLabelText('Variable name');
      const valueField = screen.getByLabelText('Value');

      expect(nameField).toBeInTheDocument();
      expect(valueField).toBeInTheDocument();

      fireEvent.change(nameField, { target: { value: longString } });
      fireEvent.change(valueField, { target: { value: longString } });

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled();
        const calls = mockUpdateConfig.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0]).toBe('defaultTest');
        expect(Object.keys(lastCall[1].vars as Record<string, string>).length).toBe(1);

        const varsEntries = Object.entries(lastCall[1].vars as Record<string, string>)[0];
        expect(varsEntries[0].length > 1000 || varsEntries[1].length > 1000).toBe(true);
      });
    });
  });

  it('converts non-string values to strings when updating variable values', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        defaultTest: {
          vars: {
            myVar: 'initial value',
          },
        },
      },
      updateConfig: mockUpdateConfig,
    });

    render(<DefaultTestVariables />);

    const valueField = screen.getByDisplayValue('initial value');

    fireEvent.change(valueField, { target: { value: '123' } });

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          myVar: '123',
        },
      });
    });

    fireEvent.change(valueField, { target: { value: 'true' } });

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          myVar: 'true',
        },
      });
    });
  });
});
