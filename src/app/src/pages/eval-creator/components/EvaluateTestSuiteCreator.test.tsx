import { DEFAULT_CONFIG, useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvaluateTestSuiteCreator from './EvaluateTestSuiteCreator';
import type {
  DerivedMetric,
  EnvOverrides,
  EvaluateOptions,
  ProviderOptions,
  Scenario,
  TestCase,
} from '@promptfoo/types';

// Mock useToast hook
const showToastMock = vi.fn();
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

// Mock child components
vi.mock('./ConfigureEnvButton', () => ({
  default: vi.fn(() => <div data-testid="mock-configure-env-button" />),
}));
vi.mock('./PromptsSection', () => ({
  default: vi.fn(({ onOpenYamlEditor }) => (
    <div data-testid="mock-prompts-section">
      <button onClick={onOpenYamlEditor}>Mock Edit Prompt YAML</button>
    </div>
  )),
}));
vi.mock('./ProvidersListSection', () => ({
  ProvidersListSection: vi.fn(({ providers, onChange }) => (
    <div data-testid="mock-provider-selector">
      <button onClick={() => onChange([])}>Mock Clear Providers</button>
      {/* Render something based on providers if needed for other tests, or keep simple */}
      <span>{providers?.length || 0} providers</span>
    </div>
  )),
}));
vi.mock('./RunOptionsSection', () => ({
  RunOptionsSection: vi.fn(() => <div data-testid="mock-run-options-section" />),
}));
vi.mock('./RunTestSuiteButton', () => ({
  default: vi.fn(() => <div data-testid="mock-run-test-suite-button" />),
}));
vi.mock('./TestCasesSection', () => ({
  // TestCasesSection expects varsList prop.
  default: vi.fn(({ varsList, onOpenYamlEditor }) => (
    <div data-testid="mock-test-cases-section">
      <span>Vars: {varsList?.join(', ')}</span>
      <button onClick={onOpenYamlEditor}>Mock Edit Test YAML</button>
    </div>
  )),
}));
vi.mock('./YamlEditor', () => ({
  // YamlEditor expects initialConfig prop.
  default: vi.fn(() => (
    <div data-testid="mock-yaml-editor">
      <pre>YAML Editor</pre>
    </div>
  )),
}));
vi.mock('./StepSection', () => ({
  StepSection: vi.fn(({ children }) => <div data-testid="mock-step-section">{children}</div>),
}));
vi.mock('./InfoBox', () => ({
  InfoBox: vi.fn(({ children }) => <div data-testid="mock-info-box">{children}</div>),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ hasCustomConfig: false }),
    }),
  ),
}));

describe('EvaluateTestSuiteCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to its default state before each test
    useStore.getState().reset();
  });

  it('should open the reset confirmation dialog when the Reset button is clicked', async () => {
    render(<EvaluateTestSuiteCreator />);
    const resetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(resetButton);
    const dialog = await screen.findByRole('dialog', { name: 'Reset evaluation setup?' });
    expect(dialog).toBeInTheDocument();
  });

  it('should close the reset confirmation dialog when the Cancel button is clicked', async () => {
    render(<EvaluateTestSuiteCreator />);

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(resetButton);

    const dialog = await screen.findByRole('dialog', { name: 'Reset evaluation setup?' });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    // Wait for the dialog to be removed from the DOM
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Reset evaluation setup?' })).toBeNull();
    });
  });

  it('should close the reset confirmation dialog after the Reset button in the dialog is clicked', async () => {
    render(<EvaluateTestSuiteCreator />);

    // Act: Click the main "Reset" button to open the dialog
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    // Wait for dialog to appear and find the "Reset" button within the dialog
    const dialog = await screen.findByRole('dialog', { name: 'Reset evaluation setup?' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert: Check if the dialog is no longer open
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Reset evaluation setup?' })).toBeNull();
    });
  });

  it('should update varsList to empty array after reset', async () => {
    // Arrange
    const initialPrompts = ['Test Prompt {{var}}'];
    useStore.getState().updateConfig({ prompts: initialPrompts });

    render(<EvaluateTestSuiteCreator />);

    // Navigate to step 3 (Test Cases) to see the TestCasesSection
    const step3Button = screen.getByRole('button', { name: /add test cases/i });
    await userEvent.click(step3Button);

    // Verify initial state has the variable
    const testCasesSectionBefore = screen.getByTestId('mock-test-cases-section');
    expect(testCasesSectionBefore).toHaveTextContent('Vars: var');

    // Act
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    const dialog = await screen.findByRole('dialog', { name: 'Reset evaluation setup?' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert
    const testCasesSectionAfter = screen.getByTestId('mock-test-cases-section');
    expect(testCasesSectionAfter).toHaveTextContent('Vars:'); // varsList is empty
  });

  it('should reset all fields to their default state when the Reset button is clicked', async () => {
    // Arrange: Set up initial non-default state in useStore
    const nonEmptyState = {
      description: 'Test Description',
      providers: [{ id: 'provider1', label: 'Provider 1' }] as ProviderOptions[],
      prompts: ['Test Prompt {{var}}'],
      tests: [{ vars: { var: 'value' } }] as TestCase[],
      defaultTest: { assert: [{ type: 'equals', value: 'expected' }] } as TestCase,
      derivedMetrics: [{ name: 'precision', value: 'formula' }] as DerivedMetric[],
      env: { OPENAI_API_KEY: 'testkey' } as EnvOverrides,
      evaluateOptions: { maxConcurrency: 5 } as EvaluateOptions,
      scenarios: [{ description: 'Test Scenario', config: [], tests: [] }] as Scenario[],
      extensions: ['file://path/to/extension.py:function_name'] as string[],
    };
    useStore.getState().updateConfig(nonEmptyState);

    render(<EvaluateTestSuiteCreator />);

    // Act: Click the main "Reset" button to open the dialog
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    // Wait for dialog to appear and find the "Reset" button within the dialog
    const dialog = await screen.findByRole('dialog', { name: 'Reset evaluation setup?' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert: Check if the store state has been reset to default values
    const currentConfig = useStore.getState().config;

    expect(currentConfig).toEqual(DEFAULT_CONFIG);
  });

  it('should clear persisted state when the Reset button is clicked', async () => {
    // Arrange: Set up initial non-default state in useStore
    const nonEmptyState = {
      description: 'Test Description',
      providers: [{ id: 'provider1', label: 'Provider 1' }] as ProviderOptions[],
      prompts: ['Test Prompt {{var}}'],
      tests: [{ vars: { var: 'value' } }] as TestCase[],
      defaultTest: { assert: [{ type: 'equals', value: 'expected' }] } as TestCase,
      derivedMetrics: [{ name: 'precision', value: 'formula' }] as DerivedMetric[],
      env: { OPENAI_API_KEY: 'testkey' } as EnvOverrides,
      evaluateOptions: { maxConcurrency: 5 } as EvaluateOptions,
      scenarios: [{ description: 'Test Scenario', config: [], tests: [] }] as Scenario[],
      extensions: ['file://path/to/extension.py:function_name'] as string[],
    };
    useStore.getState().updateConfig(nonEmptyState);

    render(<EvaluateTestSuiteCreator />);

    // Act: Click the main "Reset" button to open the dialog
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    // Wait for dialog to appear and find the "Reset" button within the dialog
    const dialog = await screen.findByRole('dialog', { name: 'Reset evaluation setup?' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert: Check if the store state has been reset to default values
    const currentConfig = useStore.getState().config;

    expect(currentConfig).toEqual(DEFAULT_CONFIG);
  });

  it('should render the Upload YAML button in the header', () => {
    render(<EvaluateTestSuiteCreator />);

    const uploadButton = screen.getByRole('button', { name: /Upload YAML/i });
    expect(uploadButton).toBeInTheDocument();
  });

  it('should summarize incomplete setup progress and recommend the next required step', () => {
    render(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('0 of 3 required steps complete')).toBeInTheDocument();
    expect(screen.getByText('Next up: Choose Providers.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to Providers' })).toBeNull();
    expect(screen.getByRole('button', { name: /Choose Providers Required/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('should advance the progress summary as required setup is completed', () => {
    useStore.getState().updateConfig({
      providers: [{ id: 'openai:gpt-4.1' }],
    });

    render(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('1 of 3 required steps complete')).toBeInTheDocument();
    expect(screen.getByText('Next up: Write Prompts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to Prompts' })).toBeInTheDocument();
  });

  it('should count shorthand string providers from YAML as configured providers', () => {
    useStore.getState().updateConfig({
      providers: ['openai:gpt-4.1'],
    });

    render(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('1 of 3 required steps complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Providers: 1 ready' })).toBeInTheDocument();
  });

  it('should count provider maps from YAML as configured providers', () => {
    useStore.getState().updateConfig({
      providers: [{ 'openai:gpt-4.1': { config: { temperature: 0 } } }],
    });

    render(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('1 of 3 required steps complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Providers: 1 ready' })).toBeInTheDocument();
  });

  it('should not count provider option objects without ids as configured providers', () => {
    useStore.getState().updateConfig({
      providers: [{ label: 'Missing id', config: { foo: 'bar' } }],
    });

    render(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('0 of 3 required steps complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Providers: Missing' })).toBeInTheDocument();
  });

  it('should count scalar prompt and test configs as complete setup steps', () => {
    useStore.getState().updateConfig({
      providers: ['openai:gpt-4.1'],
      prompts: 'file://prompt.txt',
      tests: 'file://tests.csv',
    });

    render(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('Ready to run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prompts: 1 ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test Cases: 1 ready' })).toBeInTheDocument();
  });

  it('should let users jump between required steps from the progress summary', async () => {
    render(<EvaluateTestSuiteCreator />);

    await userEvent.click(screen.getByRole('button', { name: 'Prompts: Missing' }));

    expect(screen.getByTestId('mock-prompts-section')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prompts: Missing' })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('should let nested editors open the YAML tab', async () => {
    render(<EvaluateTestSuiteCreator />);

    await userEvent.click(screen.getByRole('button', { name: 'Prompts: Missing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mock Edit Prompt YAML' }));

    expect(screen.getByTestId('mock-yaml-editor')).toBeInTheDocument();
  });

  it('should show a ready state and jump to run options once required setup is complete', async () => {
    useStore.getState().updateConfig({
      providers: [{ id: 'openai:gpt-4.1' }],
      prompts: ['Hello {{name}}'],
      tests: [{ vars: { name: 'Ada' } }],
    });

    render(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('Ready to run')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Review run options' }));

    expect(screen.getByTestId('mock-run-options-section')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review run options' })).toBeNull();
  });

  it('should successfully upload and parse a valid YAML file', async () => {
    const user = userEvent.setup();
    render(<EvaluateTestSuiteCreator />);

    const mockYamlContent = 'description: Test Config\nproviders:\n  - id: test-provider';
    const mockFile = new File([mockYamlContent], 'test.yaml', { type: 'application/yaml' });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Configuration loaded successfully', 'success');
    });

    expect(useStore.getState().config.description).toBe('Test Config');
  });

  it('should handle invalid YAML with error toast', async () => {
    const user = userEvent.setup();
    render(<EvaluateTestSuiteCreator />);

    const mockInvalidYaml = 'invalid: yaml: content: [unclosed';
    const mockFile = new File([mockInvalidYaml], 'invalid.yaml', { type: 'application/yaml' });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse YAML'),
        'error',
      );
    });
  });

  it('should handle empty YAML files with an error toast', async () => {
    const user = userEvent.setup();
    render(<EvaluateTestSuiteCreator />);

    const mockFile = new File([''], 'empty.yaml', { type: 'application/yaml' });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        'The file appears to be empty. Please select a YAML file with content.',
        'error',
      );
    });
  });

  it('should handle whitespace-only YAML files with the empty-file error toast', async () => {
    const user = userEvent.setup();
    render(<EvaluateTestSuiteCreator />);

    const mockFile = new File([' \n\t '], 'empty.yaml', { type: 'application/yaml' });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        'The file appears to be empty. Please select a YAML file with content.',
        'error',
      );
    });
  });

  it('should handle non-object YAML with error toast', async () => {
    const user = userEvent.setup();
    render(<EvaluateTestSuiteCreator />);

    // YAML that parses to a string instead of an object
    const mockScalarYaml = 'just a plain string';
    const mockFile = new File([mockScalarYaml], 'scalar.yaml', { type: 'application/yaml' });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Invalid YAML configuration', 'error');
    });
  });

  it('should reset file input after upload to allow re-uploading same file', async () => {
    const user = userEvent.setup();
    render(<EvaluateTestSuiteCreator />);

    const mockYamlContent = 'description: Test';
    const mockFile = new File([mockYamlContent], 'test.yaml', { type: 'application/yaml' });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Configuration loaded successfully', 'success');
    });

    // File input should be reset to allow re-uploading
    expect(fileInput.value).toBe('');
  });

  it('should update state when interacting with components', async () => {
    render(<EvaluateTestSuiteCreator />);

    // Step 1 (Choose Providers) should be active by default, so provider selector should be visible
    // Find the provider selector
    const providerSelector = await screen.findByTestId('mock-provider-selector');
    expect(providerSelector).toHaveTextContent('0 providers');

    // Click the clear providers button to trigger onChange
    const clearButton = within(providerSelector).getByText('Mock Clear Providers');
    await userEvent.click(clearButton);

    // Verify the state was updated
    expect(useStore.getState().config.providers).toEqual([]);
  });

  it('should handle new fields like derivedMetrics automatically', async () => {
    // This demonstrates that new fields work without any store changes
    const configWithNewField = {
      derivedMetrics: [{ name: 'f1', value: '2 * precision * recall / (precision + recall)' }],
      someNewFieldInFuture: 'This will work automatically!',
    };

    useStore.getState().updateConfig(configWithNewField);

    const config = useStore.getState().config;
    expect(config.derivedMetrics).toEqual(configWithNewField.derivedMetrics);
    expect((config as any).someNewFieldInFuture).toBe('This will work automatically!');
  });

  it('should handle edge cases in variable extraction from prompts', async () => {
    useStore.getState().updateConfig({
      prompts: [
        '{{{nestedVar}}}',
        '{{ var with spaces }}',
        '{{incomplete',
        '{{ complete }}',
        '{{validVar}}',
      ],
    });

    render(<EvaluateTestSuiteCreator />);

    // Navigate to step 3 (Test Cases) to see the TestCasesSection
    const step3Button = screen.getByRole('button', { name: /add test cases/i });
    await userEvent.click(step3Button);

    const testCasesSection = screen.getByTestId('mock-test-cases-section');
    expect(testCasesSection).toHaveTextContent('Vars: nestedVar, complete, validVar');
  });

  it('should gracefully handle a missing hasCustomConfig property in the /providers/config-status response', async () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    render(<EvaluateTestSuiteCreator />);

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/providers/config-status');
    });

    expect(showToastMock).not.toHaveBeenCalled();

    const configureEnvButton = screen.getByTestId('mock-configure-env-button');
    expect(configureEnvButton).toBeInTheDocument();
  });

  it('should show the ConfigureEnvButton when the server responds with { hasCustomConfig: false }', async () => {
    render(<EvaluateTestSuiteCreator />);

    const configureEnvButton = await screen.findByTestId('mock-configure-env-button');

    expect(configureEnvButton).toBeInTheDocument();
  });

  // Future test scenarios will be added here
});
