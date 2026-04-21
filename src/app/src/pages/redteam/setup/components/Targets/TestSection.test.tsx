import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestSection, { type TestResult } from './TestSection';

import type { ProviderOptions } from '../../types';

const renderWithProviders = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

describe('TestSection', () => {
  let mockHandleTestTarget: ReturnType<typeof vi.fn<() => void>>;
  let mockOnApplyConfigSuggestion: ReturnType<
    typeof vi.fn<(field: string, value: unknown) => void>
  >;
  let mockOnDetailsExpandedChange: ReturnType<typeof vi.fn<(expanded: boolean) => void>>;
  let baseProps: React.ComponentProps<typeof TestSection>;

  beforeEach(() => {
    mockHandleTestTarget = vi.fn<() => void>();
    mockOnApplyConfigSuggestion = vi.fn<(field: string, value: unknown) => void>();
    mockOnDetailsExpandedChange = vi.fn<(expanded: boolean) => void>();
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
      detailsExpanded: false,
      onDetailsExpandedChange: mockOnDetailsExpandedChange,
      onApplyConfigSuggestion: mockOnApplyConfigSuggestion,
    };
  });

  describe('Configuration Change Suggestions', () => {
    it("should call onApplyConfigSuggestion and mark field as applied on 'Apply' click", async () => {
      const user = userEvent.setup();
      const suggestedHeaders = { 'X-Api-Key': 'new-key-123' };
      const testResultWithSuggestion: TestResult = {
        success: false,
        changes_needed: true,
        message: 'Configuration changes are needed.',
        configuration_change_suggestion: {
          headers: suggestedHeaders,
        },
      };

      renderWithProviders(<TestSection {...baseProps} testResult={testResultWithSuggestion} />);

      const suggestionContainer = screen.getByTestId('config-suggestion-headers');
      expect(within(suggestionContainer).getByText('headers')).toBeInTheDocument();

      const applyButton = within(suggestionContainer).getByRole('button', { name: 'Apply' });
      await user.click(applyButton);

      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledTimes(1);
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('headers', suggestedHeaders);

      await waitFor(() => {
        expect(
          within(suggestionContainer).getByRole('button', { name: 'Test' }),
        ).toBeInTheDocument();
        expect(
          within(suggestionContainer).queryByRole('button', { name: 'Apply' }),
        ).not.toBeInTheDocument();
      });

      expect(suggestionContainer).toHaveClass('border-emerald-500/50');
      expect(suggestionContainer).toHaveClass('bg-emerald-500/10');
    });

    it("should call onApplyConfigSuggestion for each field in configuration_change_suggestion and mark all fields as applied when the user clicks 'Apply All'", async () => {
      const user = userEvent.setup();
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

      renderWithProviders(
        <TestSection {...baseProps} testResult={testResultWithMultipleSuggestions} />,
      );

      const applyAllButton = screen.getByRole('button', { name: 'Apply All' });
      await user.click(applyAllButton);

      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledTimes(3);
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('header1', 'value1');
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('body', { key: 'value' });
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('url', 'https://newurl.com');

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: 'Test' })).toHaveLength(4);
      });

      for (const field of ['header1', 'body', 'url']) {
        const suggestionContainer = screen.getByTestId(`config-suggestion-${field}`);
        expect(suggestionContainer).toHaveClass('border-emerald-500/50');
        expect(suggestionContainer).toHaveClass('bg-emerald-500/10');
      }
    });

    it('should handle complex nested objects in configuration_change_suggestion values', async () => {
      const user = userEvent.setup();
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

      renderWithProviders(<TestSection {...baseProps} testResult={testResultWithNestedObject} />);

      const suggestionContainer = screen.getByTestId('config-suggestion-nestedConfig');
      expect(within(suggestionContainer).getByText('nestedConfig')).toBeInTheDocument();
      expect(screen.getByText('"deepValue"', { exact: false })).toBeInTheDocument();

      const applyButton = within(suggestionContainer).getByRole('button', { name: 'Apply' });
      await user.click(applyButton);

      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledTimes(1);
      expect(mockOnApplyConfigSuggestion).toHaveBeenCalledWith('nestedConfig', nestedObject);
    });

    it('should render without errors when configuration_change_suggestion is null', () => {
      const testResultWithNullSuggestion: TestResult = {
        success: false,
        message: 'Test failed.',
        configuration_change_suggestion: undefined,
      };

      renderWithProviders(<TestSection {...baseProps} testResult={testResultWithNullSuggestion} />);

      expect(screen.getByText('Test Target Configuration')).toBeInTheDocument();
    });

    it('should render without errors when configuration_change_suggestion is undefined', () => {
      const testResultWithUndefinedSuggestion: TestResult = {
        success: false,
        message: 'Test failed.',
        configuration_change_suggestion: undefined,
      };

      renderWithProviders(
        <TestSection {...baseProps} testResult={testResultWithUndefinedSuggestion} />,
      );

      expect(screen.getByText('Test Target Configuration')).toBeInTheDocument();
    });

    it('should call onApplyConfigSuggestion with invalid JSON in body when Apply is clicked', async () => {
      const user = userEvent.setup();
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

      renderWithProviders(<TestSection {...baseProps} testResult={testResultWithInvalidJson} />);

      const suggestionContainer = screen.getByTestId('config-suggestion-body');
      expect(within(suggestionContainer).getByText('body')).toBeInTheDocument();

      const applyButton = within(suggestionContainer).getByRole('button', { name: 'Apply' });
      await user.click(applyButton);

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

      renderWithProviders(<TestSection {...baseProps} testResult={testResultWithLongValue} />);

      const longValueElement = screen.getByTestId('config-suggestion-long_header-value');
      expect(longValueElement).toHaveTextContent(longValue);
      expect(longValueElement).toHaveClass('break-all');
    });
  });
});
