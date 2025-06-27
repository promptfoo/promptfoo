import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Review from './Review';

// Mock the dependencies
vi.mock('@app/hooks/useEmailVerification', () => ({
  useEmailVerification: () => ({
    checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
  }),
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('@app/pages/eval-creator/components/YamlEditor', () => ({
  default: ({ initialYaml }: { initialYaml: string }) => (
    <div data-testid="yaml-editor">{initialYaml}</div>
  ),
}));

vi.mock('@promptfoo/redteam/sharedFrontend', () => ({
  getUnifiedConfig: vi.fn().mockReturnValue({
    description: 'Test config',
    plugins: [],
    strategies: [],
  }),
}));

vi.mock('../utils/yamlHelpers', () => ({
  generateOrderedYaml: vi.fn().mockReturnValue('description: Test config\nplugins: []'),
}));

// Mock the useRedTeamConfig hook
const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

describe('Review Component - Test Variables', () => {
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
      render(<Review />);

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

      render(<Review />);

      expect(screen.getByDisplayValue('apiKey')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-key')).toBeInTheDocument();
      expect(screen.getByDisplayValue('language')).toBeInTheDocument();
      expect(screen.getByDisplayValue('en')).toBeInTheDocument();
      expect(screen.getByDisplayValue('endpoint')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://api.example.com')).toBeInTheDocument();
    });

    it('shows proper empty state styling', () => {
      render(<Review />);

      const emptyState = screen.getByText('No test variables configured').closest('div');
      expect(emptyState).toHaveClass('MuiBox-root');
    });
  });

  describe('Adding Variables', () => {
    it('adds new variable when Add Variable button is clicked', async () => {
      render(<Review />);

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

      render(<Review />);

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
      render(<Review />);

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
      render(<Review />);

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
      render(<Review />);

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

    it('handles renaming variable that already exists', async () => {
      render(<Review />);

      const nameField = screen.getByDisplayValue('apiKey');
      fireEvent.change(nameField, { target: { value: 'language' } });

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: {
            language: 'test-key',
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

      render(<Review />);

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

      render(<Review />);

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

      render(<Review />);

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

      render(<Review />);

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

      render(<Review />);

      const addButton = screen.getByText('Add Variable');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith('defaultTest', {
          vars: { newVar: '' },
        });
      });
    });
  });

  describe('Integration with Other Sections', () => {
    it('renders other main sections alongside Test Variables', () => {
      render(<Review />);

      expect(screen.getByText('Review Your Configuration')).toBeInTheDocument();
      expect(screen.getByText('Configuration Summary')).toBeInTheDocument();
      expect(screen.getByText('Test Variables')).toBeInTheDocument();
      expect(screen.getByText('Running Your Configuration')).toBeInTheDocument();
    });
  });
});
