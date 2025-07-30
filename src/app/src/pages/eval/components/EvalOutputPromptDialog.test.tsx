import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import type { AssertionType, GradingResult } from '@promptfoo/types';

// Mock the Citations component to verify it receives the correct props
vi.mock('./Citations', () => ({
  default: vi.fn(({ citations }) => (
    <div data-testid="citations-component" data-citations={JSON.stringify(citations)}>
      Mocked Citations Component
    </div>
  )),
}));

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

describe('EvalOutputPromptDialog', () => {
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
    expect(screen.getByText('Test prompt')).toBeInTheDocument();
  });

  it('displays output when provided', () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('Test output')).toBeInTheDocument();
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

    // Find the prompt content box and trigger hover to make copy button visible
    const promptBox = screen.getByText('Test prompt').closest('.MuiPaper-root');
    expect(promptBox).toBeInTheDocument();

    fireEvent.mouseEnter(promptBox!);

    // Get the button by its aria-label (updated to match new implementation)
    const copyButton = screen.getByLabelText('Copy prompt');
    await userEvent.click(copyButton);

    expect(mockClipboard.writeText).toHaveBeenCalledWith('Test prompt');
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument();
  });

  it('copies assertion value to clipboard when copy button is clicked', async () => {
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    render(<EvalOutputPromptDialog {...defaultProps} />);

    // Trigger the hover event on the value cell to make the copy button visible
    const valueCell = screen.getByText('expected value').closest('td');
    if (valueCell) {
      fireEvent.mouseEnter(valueCell);
    }

    // Get the button by its aria-label
    const copyButton = screen.getByLabelText('Copy assertion value 0');
    await userEvent.click(copyButton);

    expect(mockClipboard.writeText).toHaveBeenCalledWith('expected value');
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

  it('displays the Citations component when citations are in metadata', () => {
    const propsWithCitations = {
      ...defaultProps,
      metadata: {
        ...defaultProps.metadata,
        citations: [
          {
            retrievedReferences: [
              {
                content: { text: 'Citation content' },
                location: { s3Location: { uri: 'https://example.com' } },
              },
            ],
          },
        ],
      },
    };

    render(<EvalOutputPromptDialog {...propsWithCitations} />);

    // Check if Citations component is rendered with correct props
    const citationsComponent = screen.getByTestId('citations-component');
    expect(citationsComponent).toBeInTheDocument();

    // Verify citations data was passed correctly
    const passedCitations = JSON.parse(citationsComponent.getAttribute('data-citations') || '[]');
    expect(passedCitations).toEqual(propsWithCitations.metadata.citations);
  });

  it('does not display the Citations component when no citations in metadata', () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    expect(screen.queryByTestId('citations-component')).not.toBeInTheDocument();
  });

  it('excludes citations from metadata table to avoid duplication', () => {
    const propsWithCitations = {
      ...defaultProps,
      metadata: {
        regularKey: 'regular value',
        citations: [{ source: 'test', content: 'test content' }],
      },
    };

    render(<EvalOutputPromptDialog {...propsWithCitations} />);

    // Regular metadata should be in the table
    expect(screen.getByText('regularKey')).toBeInTheDocument();
    expect(screen.getByText('regular value')).toBeInTheDocument();

    // Citations shouldn't appear in the metadata table
    const metadataTable = screen.getByText('Metadata').closest('div');
    expect(metadataTable?.textContent).not.toContain('citations');
  });
});

describe('EvalOutputPromptDialog metadata interaction', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
  });

  it('expands metadata value on single click', async () => {
    const longValue = 'a'.repeat(400);
    const propsWithLongValue = {
      ...defaultProps,
      metadata: {
        testKey: longValue,
      },
    };

    render(<EvalOutputPromptDialog {...propsWithLongValue} />);
    const truncatedCell = screen.getByText(/^a+\.\.\.$/);

    await act(async () => {
      await user.click(truncatedCell);
    });

    expect(screen.getByText(longValue)).toBeInTheDocument();
  });

  it('collapses metadata value on double click', async () => {
    const longValue = 'a'.repeat(400);
    const propsWithLongValue = {
      ...defaultProps,
      metadata: {
        testKey: longValue,
      },
    };

    render(<EvalOutputPromptDialog {...propsWithLongValue} />);
    const cell = screen.getByText(/^a+\.\.\.$/);

    // First click to expand
    await act(async () => {
      await user.click(cell);
    });
    expect(screen.getByText(longValue)).toBeInTheDocument();

    // Quick second click to collapse (within 300ms threshold)
    await act(async () => {
      await user.click(cell);
    });

    expect(screen.getByText(/^a+\.\.\.$/)).toBeInTheDocument();
  });

  it('maintains expanded state if second click is after threshold', async () => {
    const longValue = 'a'.repeat(400);
    const propsWithLongValue = {
      ...defaultProps,
      metadata: {
        testKey: longValue,
      },
    };

    render(<EvalOutputPromptDialog {...propsWithLongValue} />);
    const cell = screen.getByText(/^a+\.\.\.$/);

    // First click to expand
    await act(async () => {
      await user.click(cell);
    });
    expect(screen.getByText(longValue)).toBeInTheDocument();

    // Wait just over the double-click threshold (300ms)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 301));
    });

    // Second click should keep it expanded
    await act(async () => {
      await user.click(cell);
    });

    expect(screen.getByText(longValue)).toBeInTheDocument();
  });
});
