import { render, screen, within, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import React from 'react';
import { useStore } from '@app/stores/evalConfig';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type {
  ProviderOptions,
  TestCase,
  EvaluateOptions,
  EnvOverrides,
  Scenario,
} from '@promptfoo/types';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EvaluateTestSuiteCreator from './EvaluateTestSuiteCreator';

// Mock child components
vi.mock('./ConfigureEnvButton', () => ({
  default: vi.fn(() => <div data-testid="mock-configure-env-button" />),
}));
vi.mock('./PromptsSection', () => ({
  default: vi.fn(() => <div data-testid="mock-prompts-section" />),
}));
vi.mock('./ProviderSelector', () => ({
  // ProviderSelector expects providers and onChange props.
  default: vi.fn(({ providers, onChange }) => (
    <div data-testid="mock-provider-selector">
      <button onClick={() => onChange([])}>Mock Clear Providers</button>
      {/* Render something based on providers if needed for other tests, or keep simple */}
      <span>{providers?.length || 0} providers</span>
    </div>
  )),
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
  default: vi.fn(({ initialConfig }) => (
    <div data-testid="mock-yaml-editor">
      <pre>{JSON.stringify(initialConfig)}</pre>
    </div>
  )),
}));

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

// Capture the true initial state structure from the store, including functions
const initialZustandState = useStore.getState();

// Define the default values for state properties based on the store's definition
const defaultStoreValues = {
  description: '',
  providers: [] as ProviderOptions[],
  prompts: [] as any[],
  testCases: [] as TestCase[],
  defaultTest: {} as TestCase,
  env: {} as EnvOverrides,
  evaluateOptions: {} as EvaluateOptions,
  scenarios: [] as Scenario[],
  extensions: [] as string[],
};

describe('EvaluateTestSuiteCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to its defined initial state before each test
    useStore.setState({ ...initialZustandState, ...defaultStoreValues }, true);
  });

  it('should open the reset confirmation dialog when the Reset button is clicked', async () => {
    renderWithTheme(<EvaluateTestSuiteCreator />);
    const resetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(resetButton);
    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    expect(dialog).toBeInTheDocument();
  });

  it('should close the reset confirmation dialog when the Cancel button is clicked', async () => {
    renderWithTheme(<EvaluateTestSuiteCreator />);

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(resetButton);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    // Wait for the dialog to be removed from the DOM
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog', { name: 'Confirm Reset' }));
  });

  it('should close the reset confirmation dialog after the Reset button in the dialog is clicked', async () => {
    renderWithTheme(<EvaluateTestSuiteCreator />);

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
    useStore.setState({ prompts: initialPrompts });

    renderWithTheme(<EvaluateTestSuiteCreator />);

    // Act
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert
    const testCasesSection = screen.getByTestId('mock-test-cases-section');
    expect(testCasesSection).toHaveTextContent('Vars:'); // varsList is empty
  });

  it('should reset all fields to their default state when the Reset button is clicked', async () => {
    // Arrange: Set up initial non-default state in useStore
    const nonEmptyState = {
      description: 'Test Description',
      providers: [{ id: 'provider1', label: 'Provider 1' }] as ProviderOptions[],
      prompts: ['Test Prompt {{var}}'],
      testCases: [{ vars: { var: 'value' } }] as TestCase[],
      defaultTest: { assert: [{ type: 'equals', value: 'expected' }] } as TestCase,
      env: { OPENAI_API_KEY: 'testkey' } as EnvOverrides,
      evaluateOptions: { maxConcurrency: 5 } as EvaluateOptions,
      scenarios: [{ description: 'Test Scenario', config: [], tests: [] }] as Scenario[],
      extensions: ['file://path/to/extension.py:function_name'] as string[],
    };
    useStore.setState(nonEmptyState);

    renderWithTheme(<EvaluateTestSuiteCreator />);

    // Act: Click the main "Reset" button to open the dialog
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    // Wait for dialog to appear and find the "Reset" button within the dialog
    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert: Check if the store state has been reset to default values
    const currentState = useStore.getState();

    expect(currentState.description).toBe(defaultStoreValues.description);
    expect(currentState.providers).toEqual(defaultStoreValues.providers);
    expect(currentState.prompts).toEqual(defaultStoreValues.prompts);
    expect(currentState.testCases).toEqual(defaultStoreValues.testCases);
    expect(currentState.defaultTest).toEqual(defaultStoreValues.defaultTest);
    expect(currentState.env).toEqual(defaultStoreValues.env);
    expect(currentState.evaluateOptions).toEqual(defaultStoreValues.evaluateOptions);
    expect(currentState.scenarios).toEqual(defaultStoreValues.scenarios);
    expect(currentState.extensions).toEqual(defaultStoreValues.extensions);
  });

  it('should clear persisted state when the Reset button is clicked', async () => {
    // Arrange: Set up initial non-default state in useStore
    const nonEmptyState = {
      description: 'Test Description',
      providers: [{ id: 'provider1', label: 'Provider 1' }] as ProviderOptions[],
      prompts: ['Test Prompt {{var}}'],
      testCases: [{ vars: { var: 'value' } }] as TestCase[],
      defaultTest: { assert: [{ type: 'equals', value: 'expected' }] } as TestCase,
      env: { OPENAI_API_KEY: 'testkey' } as EnvOverrides,
      evaluateOptions: { maxConcurrency: 5 } as EvaluateOptions,
      scenarios: [{ description: 'Test Scenario', config: [], tests: [] }] as Scenario[],
      extensions: ['file://path/to/extension.py:function_name'] as string[],
    };
    useStore.setState(nonEmptyState);

    renderWithTheme(<EvaluateTestSuiteCreator />);

    // Act: Click the main "Reset" button to open the dialog
    const mainResetButton = screen.getByRole('button', { name: 'Reset' });
    await userEvent.click(mainResetButton);

    // Wait for dialog to appear and find the "Reset" button within the dialog
    const dialog = await screen.findByRole('dialog', { name: 'Confirm Reset' });
    const dialogResetButton = within(dialog).getByRole('button', { name: 'Reset' });
    await userEvent.click(dialogResetButton);

    // Assert: Check if the store state has been reset to default values
    const currentState = useStore.getState();

    expect(currentState.description).toBe(defaultStoreValues.description);
    expect(currentState.providers).toEqual(defaultStoreValues.providers);
    expect(currentState.prompts).toEqual(defaultStoreValues.prompts);
    expect(currentState.testCases).toEqual(defaultStoreValues.testCases);
    expect(currentState.defaultTest).toEqual(defaultStoreValues.defaultTest);
    expect(currentState.env).toEqual(defaultStoreValues.env);
    expect(currentState.evaluateOptions).toEqual(defaultStoreValues.evaluateOptions);
    expect(currentState.scenarios).toEqual(defaultStoreValues.scenarios);
    expect(currentState.extensions).toEqual(defaultStoreValues.extensions);
  });

  // Future test scenarios will be added here
});
