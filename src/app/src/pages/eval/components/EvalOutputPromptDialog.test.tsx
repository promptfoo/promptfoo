import { render, screen } from '@testing-library/react';
import React from 'react';
import type { AssertionType, GradingResult } from '@promptfoo/types';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';

describe('EvalOutputPromptDialog', () => {
  const mockOnClose = vi.fn();
  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    prompt: 'Test prompt',
    provider: 'test-provider',
    output: 'Test output',
    gradingResults: [
      {
        pass: true,
        score: 1.0,
        assertion: {
          type: 'contains',
          value: 'expected value',
          metric: 'Custom Metric Name',
        },
        reason: 'Test reason',
      } satisfies GradingResult,
    ],
    metadata: {
      testKey: 'testValue',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with the correct title', () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    expect(screen.getByText('Details: test-provider')).toBeInTheDocument();
  });

  it('displays prompt content', () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test prompt')).toBeInTheDocument();
  });

  it('displays output when provided', () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test output')).toBeInTheDocument();
  });

  it('displays assertion results table with metrics when provided', () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    expect(screen.getByText('Assertions')).toBeInTheDocument();
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('contains')).toBeInTheDocument();
    expect(screen.getByText('✅')).toBeInTheDocument();
  });

  it('does not display metrics column when no metrics are present', () => {
    const propsWithoutMetrics = {
      ...defaultProps,
      gradingResults: [
        {
          ...defaultProps.gradingResults[0],
          assertion: {
            type: 'exact' as AssertionType,
            value: 'expected value',
          },
        } satisfies GradingResult,
      ],
    };
    render(<EvalOutputPromptDialog {...propsWithoutMetrics} />);
    expect(screen.queryByText('Metric')).not.toBeInTheDocument();
  });

  it('displays metadata table when provided', () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    expect(screen.getByText('Metadata')).toBeInTheDocument();
    expect(screen.getByText('testKey')).toBeInTheDocument();
    expect(screen.getByText('testValue')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    await userEvent.click(screen.getByText('Close'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('copies prompt to clipboard when copy button is clicked', async () => {
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    render(<EvalOutputPromptDialog {...defaultProps} />);
    await userEvent.click(screen.getByTestId('ContentCopyIcon').parentElement!);

    expect(mockClipboard.writeText).toHaveBeenCalledWith('Test prompt');
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument();
  });

  it('expands truncated values when clicked', async () => {
    const longValue = 'a'.repeat(400);
    const propsWithLongValue = {
      ...defaultProps,
      gradingResults: [
        {
          ...defaultProps.gradingResults[0],
          assertion: {
            type: 'exact' as AssertionType,
            value: longValue,
            metric: 'contains',
          },
        } satisfies GradingResult,
      ],
    };

    render(<EvalOutputPromptDialog {...propsWithLongValue} />);
    const truncatedCell = screen.getByText(/^a+\.\.\.$/);
    await userEvent.click(truncatedCell);
    expect(screen.getByText(longValue)).toBeInTheDocument();
  });
});
