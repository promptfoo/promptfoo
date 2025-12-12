import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import TestSection, { type TestResult } from './TestSection';
import type { ProviderOptions } from '../../types';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('TestSection', () => {
  let mockHandleTestTarget: ReturnType<typeof vi.fn>;
  let mockOnApplyConfigSuggestion: ReturnType<typeof vi.fn>;
  let baseProps: any;

  beforeEach(() => {
    mockHandleTestTarget = vi.fn();
    mockOnApplyConfigSuggestion = vi.fn();
    baseProps = {
      selectedTarget: {
        id: 'http:custom',
        label: 'My Custom Target',
        config: {
          url: 'https://example.com/api',
        },
      } as ProviderOptions,
      isTestRunning: false,
      testResult: null,
      handleTestTarget: mockHandleTestTarget,
      disabled: false,
      onApplyConfigSuggestion: mockOnApplyConfigSuggestion,
    };
  });

  describe('Configuration Change Suggestions', () => {
    it("should call onApplyConfigSuggestion and mark field as applied on 'Apply' click", async () => {
      const suggestedHeaders = { 'X-Api-Key': 'new-key-123' };
      const testResultWithSuggestion: TestResult = {
        success: false,
        changes_needed: true,
        message: 'Configuration changes are needed.',
        configuration_change_suggestion: {
          headers: suggestedHeaders,
        },
      };

      renderWithTheme(<TestSection {...baseProps} testResult={testResultWithSuggestion} />);

      const headersLabel = screen.getByText('headers:');
      const suggestionContainer = headersLabel.closest('div[class*="MuiBox-root"]')?.parentElement;
      expect(suggestionContainer).toBeInTheDocument();

      const { getByRole: getByRoleInContainer } = within(suggestionContainer as HTMLElement);
      const applyButton = getByRoleInContainer('button', { name: 'Apply' });

      fireEvent.click(applyButton);

      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledTimes(1);
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('headers', suggestedHeaders);

      await waitFor(() => {
        const { getByRole, queryByRole } = within(suggestionContainer as HTMLElement);
        expect(getByRole('button', { name: 'Test' })).toBeInTheDocument();
        expect(queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
      });

      expect(suggestionContainer).toHaveStyle('background-color: rgba(76, 175, 80, 0.1)');
      expect(suggestionContainer).toHaveStyle('border: 1px solid rgba(76, 175, 80, 0.3)');
    });

    it("should call onApplyConfigSuggestion for each field in configuration_change_suggestion and mark all fields as applied when the user clicks 'Apply All'", async () => {
      const testResultWithMultipleSuggestions: TestResult = {
        success: false,
        changes_needed: true,
        message: 'Configuration changes are needed.',
        configuration_change_suggestion: {
          header1: 'value1',
          body: { key: 'value' },
          url: 'https://newurl.com',
        },
      };

      renderWithTheme(
        <TestSection {...baseProps} testResult={testResultWithMultipleSuggestions} />,
      );

      const applyAllButton = screen.getByRole('button', { name: 'Apply All' });
      fireEvent.click(applyAllButton);

      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledTimes(3);
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('header1', 'value1');
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('body', { key: 'value' });
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('url', 'https://newurl.com');

      await waitFor(() => {
        const testButtons = screen.getAllByRole('button', { name: 'Test' });
        const applyAllTestButton = testButtons.find((button) =>
          button.classList.contains('MuiButton-contained'),
        );
        expect(applyAllTestButton).toBeInTheDocument();
      });

      const header1Label = screen.getByText('header1:');
      const header1Container = header1Label.closest('div[class*="MuiBox-root"]')?.parentElement;
      expect(header1Container).toHaveStyle('background-color: rgba(76, 175, 80, 0.1)');
      expect(header1Container).toHaveStyle('border: 1px solid rgba(76, 175, 80, 0.3)');

      const bodyLabel = screen.getByText('body:');
      const bodyContainer = bodyLabel.closest('div[class*="MuiBox-root"]')?.parentElement;
      expect(bodyContainer).toHaveStyle('background-color: rgba(76, 175, 80, 0.1)');
      expect(bodyContainer).toHaveStyle('border: 1px solid rgba(76, 175, 80, 0.3)');

      const urlLabel = screen.getByText('url:');
      const urlContainer = urlLabel.closest('div[class*="MuiBox-root"]')?.parentElement;
      expect(urlContainer).toHaveStyle('background-color: rgba(76, 175, 80, 0.1)');
      expect(urlContainer).toHaveStyle('border: 1px solid rgba(76, 175, 80, 0.3)');
    });

    it('should handle complex nested objects in configuration_change_suggestion values', () => {
      const nestedObject = {
        level1: {
          level2: {
            level3: 'deepValue',
          },
        },
      };
      const testResultWithNestedObject: TestResult = {
        success: false,
        changes_needed: true,
        message: 'Configuration changes are needed.',
        configuration_change_suggestion: {
          nestedConfig: nestedObject,
        },
      };

      renderWithTheme(<TestSection {...baseProps} testResult={testResultWithNestedObject} />);

      const nestedConfigLabel = screen.getByText('nestedConfig:');
      const suggestionContainer = nestedConfigLabel.closest(
        'div[class*="MuiBox-root"]',
      )?.parentElement;
      expect(suggestionContainer).toBeInTheDocument();

      const { getByRole: getByRoleInContainer } = within(suggestionContainer as HTMLElement);
      const applyButton = getByRoleInContainer('button', { name: 'Apply' });

      fireEvent.click(applyButton);

      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledTimes(1);
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('nestedConfig', nestedObject);
    });

    it('should render without errors when configuration_change_suggestion is null', () => {
      const testResultWithNullSuggestion: TestResult = {
        success: false,
        message: 'Test failed.',
        configuration_change_suggestion: undefined,
      };

      renderWithTheme(<TestSection {...baseProps} testResult={testResultWithNullSuggestion} />);

      expect(screen.getByText('Test Target Configuration')).toBeInTheDocument();
    });

    it('should render without errors when configuration_change_suggestion is undefined', () => {
      const testResultWithUndefinedSuggestion: TestResult = {
        success: false,
        message: 'Test failed.',
        configuration_change_suggestion: undefined,
      };

      renderWithTheme(
        <TestSection {...baseProps} testResult={testResultWithUndefinedSuggestion} />,
      );

      expect(screen.getByText('Test Target Configuration')).toBeInTheDocument();
    });

    it('should call onApplyConfigSuggestion with invalid JSON in body when Apply is clicked', () => {
      const invalidJson =
        '{\n  "messages": [\n    "role": "user",\n    "content": "{{prompt}}"\n  ]\n}';
      const testResultWithInvalidJson: TestResult = {
        success: false,
        changes_needed: true,
        message: 'Configuration changes are needed.',
        configuration_change_suggestion: {
          body: invalidJson,
        },
      };

      renderWithTheme(<TestSection {...baseProps} testResult={testResultWithInvalidJson} />);

      const bodyLabel = screen.getByText('body:');
      const suggestionContainer = bodyLabel.closest('div[class*="MuiBox-root"]')?.parentElement;
      expect(suggestionContainer).toBeInTheDocument();

      const { getByRole: getByRoleInContainer } = within(suggestionContainer as HTMLElement);
      const applyButton = getByRoleInContainer('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledTimes(1);
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('body', invalidJson);
    });

    it('should display configuration suggestions with extremely long values without overflowing the UI', () => {
      const longValue = 'ThisIsAnExtremelyLongStringValueThatShouldNotOverflowTheUI'.repeat(20);
      const testResultWithLongValue: TestResult = {
        success: false,
        changes_needed: true,
        message: 'Configuration changes are needed.',
        configuration_change_suggestion: {
          long_header: longValue,
        },
      };

      renderWithTheme(<TestSection {...baseProps} testResult={testResultWithLongValue} />);

      const longValueElement = screen.getByText(longValue);
      expect(longValueElement).toBeInTheDocument();

      expect(longValueElement).toHaveStyle('word-break: break-word');
    });
  });
});
