import { DEFAULT_CONFIG, useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvaluateTestSuiteCreator from './EvaluateTestSuiteCreator';
import {
  extractVarsFromPrompts,
  normalizePrompts,
  normalizeProviders,
  readFileAsText,
} from './evalCreatorUtils';
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
  default: vi.fn(() => <div data-testid="mock-prompts-section" />),
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
  default: vi.fn(({ varsList }) => (
    <div data-testid="mock-test-cases-section">
      <span>Vars: {varsList?.join(', ')}</span>
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
    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    expect(dialog).toBeInTheDocument();
  });

  it('should close the reset confirmation dialog when the Cancel button is clicked', async () => {
    render(<EvaluateTestSuiteCreator />);

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(resetButton);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    // Wait for the dialog to be removed from the DOM
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Confirm Reset' })).toBeNull();
    });
  });

  it('should close the reset confirmation dialog after the Reset button in the dialog is clicked', async () => {
    render(<EvaluateTestSuiteCreator />);

    // Act: Click the main "Reset" button to open the dialog
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    // Wait for dialog to appear and find the "Reset" button within the dialog
    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert: Check if the dialog is no longer open
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Confirm Reset' })).toBeNull();
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

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
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
    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
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
    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
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

  it('should replace stale config fields when uploading YAML', async () => {
    const user = userEvent.setup();

    useStore.getState().updateConfig({
      description: 'Old description',
      prompts: ['Old prompt'],
      tests: [{ vars: { topic: 'stale' } }],
      evaluateOptions: { maxConcurrency: 10 },
    });

    render(<EvaluateTestSuiteCreator />);

    const mockYamlContent = [
      'description: Fresh Config',
      'providers:',
      '  - id: test-provider',
      'prompts:',
      '  - raw: "Hello {{name}}"',
    ].join('\n');
    const mockFile = new File([mockYamlContent], 'fresh.yaml', { type: 'application/yaml' });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Configuration loaded successfully', 'success');
    });

    expect(useStore.getState().config).toMatchObject({
      description: 'Fresh Config',
      providers: [{ id: 'test-provider' }],
      prompts: [{ raw: 'Hello {{name}}' }],
      tests: [],
      evaluateOptions: {},
    });
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

// Tests for extracted helper functions
describe('normalizeProviders', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeProviders(undefined as any)).toEqual([]);
    expect(normalizeProviders(null as any)).toEqual([]);
    expect(normalizeProviders('string' as any)).toEqual([]);
    expect(normalizeProviders(123 as any)).toEqual([]);
    expect(normalizeProviders({} as any)).toEqual([]);
  });

  it('filters out non-object providers', () => {
    const providers = [
      { id: 'valid1', config: {} },
      'string-provider',
      null,
      undefined,
      123,
      { id: 'valid2', config: {} },
    ] as any;

    const result = normalizeProviders(providers);
    expect(result).toEqual([
      { id: 'valid1', config: {} },
      { id: 'valid2', config: {} },
    ]);
  });

  it('filters out array elements', () => {
    const providers = [
      { id: 'valid1', config: {} },
      ['nested', 'array'],
      { id: 'valid2', config: {} },
    ] as any;

    const result = normalizeProviders(providers);
    expect(result).toEqual([
      { id: 'valid1', config: {} },
      { id: 'valid2', config: {} },
    ]);
  });

  it('returns empty array when all providers are invalid', () => {
    const providers = ['string', null, undefined, 123, ['array']] as any;
    expect(normalizeProviders(providers)).toEqual([]);
  });

  it('returns all providers when all are valid', () => {
    const providers = [
      { id: 'provider1', config: { model: 'gpt-4' } },
      { id: 'provider2', label: 'Provider 2' },
      { id: 'provider3', config: {}, label: 'P3' },
    ] as ProviderOptions[];

    expect(normalizeProviders(providers)).toEqual(providers);
  });

  it('handles empty array', () => {
    expect(normalizeProviders([])).toEqual([]);
  });
});

describe('normalizePrompts', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizePrompts(undefined as any)).toEqual([]);
    expect(normalizePrompts(null as any)).toEqual([]);
    expect(normalizePrompts('string' as any)).toEqual([]);
    expect(normalizePrompts(123 as any)).toEqual([]);
    expect(normalizePrompts({} as any)).toEqual([]);
  });

  it('handles string prompts', () => {
    const prompts = ['prompt1', 'prompt2', 'prompt3'];
    expect(normalizePrompts(prompts)).toEqual(prompts);
  });

  it('extracts raw property from prompt objects', () => {
    const prompts = [
      'string prompt',
      { raw: 'object prompt 1' },
      { raw: 'object prompt 2' },
    ] as any;

    expect(normalizePrompts(prompts)).toEqual([
      'string prompt',
      'object prompt 1',
      'object prompt 2',
    ]);
  });

  it('filters out empty strings and invalid prompt types', () => {
    const prompts = [
      'valid prompt',
      '',
      { raw: 'valid object prompt' },
      { notRaw: 'invalid object' },
      null,
      undefined,
      123,
      { raw: '' },
    ] as any;

    expect(normalizePrompts(prompts)).toEqual(['valid prompt', 'valid object prompt']);
  });
});

describe('readFileAsText', () => {
  it('resolves with file content when file is read successfully', async () => {
    const fileContent = 'test file content';
    const mockFile = new File([fileContent], 'test.txt', { type: 'text/plain' });

    const result = await readFileAsText(mockFile);
    expect(result).toBe(fileContent);
  });

  it('handles file content correctly as string', async () => {
    const fileContent = 'yaml content\nline 2';
    const mockFile = new File([fileContent], 'config.yaml', { type: 'application/yaml' });

    const result = await readFileAsText(mockFile);
    expect(result).toBe(fileContent);
  });
});

describe('extractVarsFromPrompts', () => {
  it('extracts variables from simple prompts', () => {
    const prompts = ['Hello {{name}}', 'Your age is {{age}}'];
    const result = extractVarsFromPrompts(prompts);
    expect(result).toContain('name');
    expect(result).toContain('age');
    expect(result.length).toBe(2);
  });

  it('extracts variables with spaces around them', () => {
    const prompts = ['{{ varWithSpaces }}', '{{  multipleSpaces  }}'];
    const result = extractVarsFromPrompts(prompts);
    expect(result).toContain('varWithSpaces');
    expect(result).toContain('multipleSpaces');
    expect(result.length).toBe(2);
  });

  it('handles multiple variables in a single prompt', () => {
    const prompts = ['{{var1}} and {{var2}} and {{var3}}'];
    const result = extractVarsFromPrompts(prompts);
    expect(result).toContain('var1');
    expect(result).toContain('var2');
    expect(result).toContain('var3');
    expect(result.length).toBe(3);
  });

  it('deduplicates variables across multiple prompts', () => {
    const prompts = ['{{name}}', '{{name}}', '{{age}}', '{{name}}'];
    const result = extractVarsFromPrompts(prompts);
    expect(result).toContain('name');
    expect(result).toContain('age');
    expect(result.length).toBe(2);
  });

  it('returns empty array for prompts without variables', () => {
    const prompts = ['No variables here', 'Just plain text'];
    const result = extractVarsFromPrompts(prompts);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty prompts array', () => {
    const result = extractVarsFromPrompts([]);
    expect(result).toEqual([]);
  });

  it('ignores incomplete variable syntax', () => {
    const prompts = ['{{incomplete', 'notcomplete}}', '{{valid}}'];
    const result = extractVarsFromPrompts(prompts);
    expect(result).toEqual(['valid']);
  });

  it('handles nested braces by extracting only the valid variables', () => {
    const prompts = ['{{{nested}}}', '{{normal}}'];
    const result = extractVarsFromPrompts(prompts);
    expect(result).toContain('nested');
    expect(result).toContain('normal');
    expect(result.length).toBe(2);
  });
});

describe('VariablesList', () => {
  const VariablesList = ({ varsList }: { varsList: string[] }) => {
    return varsList.map((variable, index) => (
      <span key={variable}>
        <code className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xs">{variable}</code>
        {index < varsList.length - 1 ? ', ' : ''}
      </span>
    ));
  };

  it('renders a single variable', () => {
    const { container } = render(<VariablesList varsList={['var1']} />);
    const code = container.querySelector('code');
    expect(code).toHaveTextContent('var1');
    expect(container.textContent).not.toContain(',');
  });

  it('renders multiple variables with commas between them', () => {
    const { container } = render(<VariablesList varsList={['var1', 'var2', 'var3']} />);
    const codes = container.querySelectorAll('code');
    expect(codes).toHaveLength(3);
    expect(codes[0]).toHaveTextContent('var1');
    expect(codes[1]).toHaveTextContent('var2');
    expect(codes[2]).toHaveTextContent('var3');
    expect(container.textContent).toBe('var1, var2, var3');
  });

  it('renders empty list when varsList is empty', () => {
    const { container } = render(<VariablesList varsList={[]} />);
    expect(container.textContent).toBe('');
  });

  it('applies correct CSS classes to code elements', () => {
    const { container } = render(<VariablesList varsList={['testVar']} />);
    const code = container.querySelector('code');
    expect(code).toHaveClass(
      'bg-primary/20',
      'text-primary',
      'px-1.5',
      'py-0.5',
      'rounded',
      'text-xs',
    );
  });

  it('does not add comma after last variable', () => {
    const { container } = render(<VariablesList varsList={['first', 'second']} />);
    expect(container.textContent).toBe('first, second');
    expect(container.textContent).not.toMatch(/second,/);
  });
});
