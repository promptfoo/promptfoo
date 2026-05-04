import { type TestTimers, useTestTimers } from '@app/tests/timers';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DefaultTestVariables from './DefaultTestVariables';

// Mock the useRedTeamConfig hook
const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

describe('DefaultTestVariables Component', () => {
  let timers: TestTimers;

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
    timers = useTestTimers();
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updateConfig: mockUpdateConfig,
    });
  });

  afterEach(() => {
    timers.restore();
  });

  async function flushDebouncedUpdate() {
    await act(async () => {
      await timers.advanceByAsync(300);
    });
  }

  function clickElement(element: Element) {
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  function replaceInputValue(element: Element, value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        element,
        value,
      );
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

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
      expect(screen.getByText('Click "Add Variable" to get started')).toBeInTheDocument();
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
      // Now uses Tailwind classes instead of MUI
      expect(emptyState).toHaveClass('border-dashed');
    });
  });

  describe('Adding Variables', () => {
    it('adds new variable when Add Variable button is clicked', async () => {
      render(<DefaultTestVariables />);

      const addButton = screen.getByText('Add Variable');
      clickElement(addButton);

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: { newVar: '' },
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
      clickElement(addButton);

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: { newVar: 'value1', newVar1: '' },
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
      replaceInputValue(nameField, 'newApiKey');

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          newApiKey: 'test-key',
          language: 'en',
          endpoint: 'https://api.example.com',
        },
      });
    });

    it('updates variable value when typing in value field', async () => {
      render(<DefaultTestVariables />);

      const valueField = screen.getByDisplayValue('test-key');
      replaceInputValue(valueField, 'new-test-key');

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          apiKey: 'new-test-key',
          language: 'en',
          endpoint: 'https://api.example.com',
        },
      });
    });

    it('removes variable when delete button is clicked', async () => {
      render(<DefaultTestVariables />);

      // Get delete buttons by their aria-label pattern
      const deleteButtons = screen.getAllByRole('button', { name: /delete variable/i });
      expect(deleteButtons).toHaveLength(3);

      clickElement(deleteButtons[0]);

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          language: 'en',
          endpoint: 'https://api.example.com',
        },
      });
    });

    it('shows validation error when creating duplicate variable names', async () => {
      render(<DefaultTestVariables />);

      const nameField = screen.getByDisplayValue('apiKey');
      replaceInputValue(nameField, 'language');

      // Should show validation error for duplicate names
      const errors = screen.getAllByText('Duplicate variable name');
      expect(errors).toHaveLength(2); // Both duplicates should show error

      // Variables with validation errors should not be included in global state
      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          endpoint: 'https://api.example.com',
        },
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

      // Labels are now sr-only, but still accessible
      const nameFields = screen.getAllByPlaceholderText('Variable name');
      const valueFields = screen.getAllByPlaceholderText('Value');

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

      // Get delete buttons by their aria-label pattern (Lucide icons, not MUI)
      const deleteButtons = screen.getAllByRole('button', { name: /delete variable/i });
      expect(deleteButtons).toHaveLength(3);

      deleteButtons.forEach((button) => {
        expect(button).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-label', expect.stringContaining('Delete variable'));
      });
    });

    it('renders the empty state container with correct styling', () => {
      render(<DefaultTestVariables />);

      const emptyStateContainer = screen.getByText('No test variables configured').closest('div');
      // Uses Tailwind classes for styling instead of inline styles
      expect(emptyStateContainer).toHaveClass('border-dashed');
      expect(emptyStateContainer).toHaveClass('rounded-lg');
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
      clickElement(addButton);

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: { newVar: '' },
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
      replaceInputValue(nameField, 'invalid@#$ name');

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          'invalid@#$ name': 'test-key',
          language: 'en',
          endpoint: 'https://api.example.com',
        },
      });
    });

    it('filters out variables with empty names from global state', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const nameField = screen.getByDisplayValue('apiKey');
      replaceInputValue(nameField, '');

      // Variables with empty names should be filtered out from global state
      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
        vars: {
          language: 'en',
          endpoint: 'https://api.example.com',
        },
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

      // Use placeholder text to find inputs since labels are sr-only
      const nameField = screen.getByPlaceholderText('Variable name');
      const valueField = screen.getByPlaceholderText('Value');

      expect(nameField).toBeInTheDocument();
      expect(valueField).toBeInTheDocument();

      replaceInputValue(nameField, String(longString));
      replaceInputValue(valueField, String(longString));

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalled();
      const calls = mockUpdateConfig.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe('defaultTest');
      expect(Object.keys(lastCall[1].vars as Record<string, string>).length).toBe(1);

      const varsEntries = Object.entries(lastCall[1].vars as Record<string, string>)[0];
      expect(varsEntries[0].length > 1000 || varsEntries[1].length > 1000).toBe(true);
    });
  });

  describe('Local state preservation', () => {
    it('preserves local edits when global config changes', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithVariables,
        updateConfig: mockUpdateConfig,
      });
      render(<DefaultTestVariables />);

      const apiKeyField = screen.getByDisplayValue('test-key');

      replaceInputValue(apiKeyField, 'edited-key');

      const newConfig = {
        ...configWithVariables,
        defaultTest: {
          vars: {
            apiKey: 'new-global-key',
            language: 'en',
            endpoint: 'https://api.example.com',
          },
        },
      };
      mockUseRedTeamConfig.mockReturnValue({
        config: newConfig,
        updateConfig: mockUpdateConfig,
      });

      expect(screen.getByDisplayValue('edited-key')).toBeInTheDocument();
    });
  });

  it('shows validation error when variable names have same trimmed value but different raw values', async () => {
    render(<DefaultTestVariables />);

    const addButton = screen.getByText('Add Variable');
    clickElement(addButton);

    let variableInputs = screen.getAllByPlaceholderText('Variable name');
    expect(variableInputs.length).toBe(1);
    replaceInputValue(variableInputs[0], ' var');
    clickElement(addButton);

    variableInputs = screen.getAllByPlaceholderText('Variable name');
    expect(variableInputs.length).toBe(2);
    replaceInputValue(variableInputs[1], 'var ');

    expect(screen.getAllByText('Duplicate variable name')).toHaveLength(2);
  });

  describe('ID Generation', () => {
    it('generates unique IDs even when multiple variables are created in the same millisecond', async () => {
      const timestamp = Date.now();
      timers.setSystemTime(timestamp);

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: { vars: {} },
        },
        updateConfig: mockUpdateConfig,
      });

      render(<DefaultTestVariables />);

      const addButton = screen.getByText('Add Variable');
      clickElement(addButton);
      clickElement(addButton);
      clickElement(addButton);

      await flushDebouncedUpdate();

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);

      const vars = mockUpdateConfig.mock.calls[0][1].vars;
      const ids = Object.keys(vars);

      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[0]).not.toBe(ids[2]);
      expect(ids[1]).not.toBe(ids[2]);
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

    replaceInputValue(valueField, '123');

    await flushDebouncedUpdate();

    expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
      vars: {
        myVar: '123',
      },
    });

    replaceInputValue(valueField, 'true');

    await flushDebouncedUpdate();

    expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
      vars: {
        myVar: 'true',
      },
    });
  });
});
