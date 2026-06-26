import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestSection, { type TestResult } from './TestSection';

import type { ProviderOptions } from '../../types';

const renderWithProviders = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

describe('TestSection response parser suggestions', () => {
  let onApplyTransformResponseSuggestion: ReturnType<typeof vi.fn<(value: string) => void>>;
  let baseProps: React.ComponentProps<typeof TestSection>;

  beforeEach(() => {
    onApplyTransformResponseSuggestion = vi.fn<(value: string) => void>();
    baseProps = {
      selectedTarget: {
        id: 'http:custom',
        label: 'My Custom Target',
        config: { url: 'https://example.com/api' },
      } as ProviderOptions,
      isTestRunning: false,
      testResult: null,
      handleTestTarget: vi.fn(),
      disabled: false,
      detailsExpanded: false,
      onDetailsExpandedChange: vi.fn(),
      onApplyTransformResponseSuggestion,
    };
  });

  it('renders and applies the single validated response parser suggestion', async () => {
    const user = userEvent.setup();
    const testResult: TestResult = {
      success: false,
      changes_needed: true,
      message: 'The response parser needs an update.',
      configuration_change_suggestion: { transformResponse: 'json.response' },
    };

    renderWithProviders(<TestSection {...baseProps} testResult={testResult} />);

    const suggestion = screen.getByTestId('config-suggestion-transformResponse');
    expect(within(suggestion).getByText('Response parser (transformResponse)')).toBeInTheDocument();
    expect(within(suggestion).getByText('json.response')).toBeInTheDocument();

    await user.click(
      within(suggestion).getByRole('button', { name: 'Apply response parser suggestion' }),
    );

    expect(onApplyTransformResponseSuggestion).toHaveBeenCalledOnce();
    expect(onApplyTransformResponseSuggestion).toHaveBeenCalledWith('json.response');
    expect(screen.queryByRole('button', { name: 'Apply All' })).not.toBeInTheDocument();
  });

  it('does not render an action for malformed runtime suggestion values', () => {
    const testResult = {
      success: false,
      changes_needed: true,
      message: 'Malformed analyzer output.',
      configuration_change_suggestion: { transformResponse: { code: 'process.env' } },
    } as unknown as TestResult;

    renderWithProviders(<TestSection {...baseProps} testResult={testResult} />);

    expect(screen.queryByTestId('config-suggestion-transformResponse')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply response parser suggestion' }),
    ).not.toBeInTheDocument();
  });
});
