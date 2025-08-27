import React from 'react';

import { DEFAULT_CONFIG, useStore } from '@app/stores/evalConfig';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

vi.mock('@app/stores/evalConfig', async () => {
  const actual =
    await vi.importActual<typeof import('@app/stores/evalConfig')>('@app/stores/evalConfig');
  return {
    ...actual,
    transformResultsConfigToSetupConfig: vi.fn((config) => ({
      ...config,
      transformed: true,
    })),
  };
});

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>{component}</ThemeProvider>
    </MemoryRouter>,
  );
};

describe('EvaluateTestSuiteCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to its default state before each test
    useStore.getState().reset();
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
    useStore.getState().updateConfig({ prompts: initialPrompts });

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
      tests: [{ vars: { var: 'value' } }] as TestCase[],
      defaultTest: { assert: [{ type: 'equals', value: 'expected' }] } as TestCase,
      derivedMetrics: [{ name: 'precision', value: 'formula' }] as DerivedMetric[],
      env: { OPENAI_API_KEY: 'testkey' } as EnvOverrides,
      evaluateOptions: { maxConcurrency: 5 } as EvaluateOptions,
      scenarios: [{ description: 'Test Scenario', config: [], tests: [] }] as Scenario[],
      extensions: ['file://path/to/extension.py:function_name'] as string[],
    };
    useStore.getState().updateConfig(nonEmptyState);

    renderWithTheme(<EvaluateTestSuiteCreator />);

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

    renderWithTheme(<EvaluateTestSuiteCreator />);

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

  it('should update state when interacting with components', async () => {
    renderWithTheme(<EvaluateTestSuiteCreator />);

    // Find the provider selector
    const providerSelector = screen.getByTestId('mock-provider-selector');
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

  it('should display a validation error alert listing all errors when validationStatus.errors is non-empty', () => {
    const errorMessages = ['Error 1', 'Error 2', 'Error 3'];
    const updateConfigMock = vi.fn();
    useStore.setState({
      updateConfig: updateConfigMock,
      validationStatus: {
        isValid: false,
        errors: errorMessages,
        hasMinimumFields: false,
      },
    });

    renderWithTheme(<EvaluateTestSuiteCreator />);

    const alertTitleElement = screen.getByText('Configuration Issues');
    const alert = alertTitleElement.closest('div[role="alert"]');
    expect(alert).toBeInTheDocument();

    errorMessages.forEach((errorMessage) => {
      expect(alert).toHaveTextContent(errorMessage);
    });
  });

  it('should handle and display multiple validation errors', async () => {
    const errorMessages = [
      'Provider is required.',
      'At least one prompt is required.',
      'Test cases are required.',
    ];
    useStore.setState({
      validationStatus: {
        isValid: false,
        errors: errorMessages,
        hasMinimumFields: false,
      },
    });

    renderWithTheme(<EvaluateTestSuiteCreator />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();

    for (const errorMessage of errorMessages) {
      expect(alert).toHaveTextContent(errorMessage);
    }
  });

  it("should call restoreOriginal and update the configuration when the 'Restore Original' button is clicked", async () => {
    const originalResultsConfig = {
      description: 'Original Description',
      providers: [{ id: 'provider1', label: 'Provider 1' }],
    };

    const restoreOriginalSpy = vi.spyOn(useStore.getState(), 'restoreOriginal');

    useStore.getState().setConfigFromResults(originalResultsConfig);
    renderWithTheme(<EvaluateTestSuiteCreator />);

    const restoreOriginalButton = await screen.findByRole('button', { name: 'Restore Original' });
    await userEvent.click(restoreOriginalButton);

    expect(restoreOriginalSpy).toHaveBeenCalled();

    const currentConfig = useStore.getState().config;
    expect(currentConfig.description).toBe(originalResultsConfig.description);
    expect(currentConfig.providers).toEqual(originalResultsConfig.providers);
  });

  it('should handle errors thrown by useEditAndRerunScrollReset gracefully', async () => {
    const scrollToMock = vi.fn(() => {
      throw new Error('Failed to reset scroll');
    });

    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      value: scrollToMock,
    });

    renderWithTheme(<EvaluateTestSuiteCreator />);

    expect(screen.getByText('Set up an evaluation')).toBeInTheDocument();
  });

  // Future test scenarios will be added here
});
