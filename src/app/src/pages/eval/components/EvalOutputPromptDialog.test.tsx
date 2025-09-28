import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CITATIONS_METADATA_KEY, PROMPTFOO_FILE_METADATA_KEY } from '@app/constants/metadata';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import type { AssertionType, GradingResult } from '@promptfoo/types';
import { useTableStore } from './store';
import * as ReactDOM from 'react-dom';

// Mock the Citations component to verify it receives the correct props
vi.mock('./Citations', () => ({
  default: vi.fn(({ citations }) => (
    <div data-testid="citations-component" data-citations={JSON.stringify(citations)}>
      Mocked Citations Component
    </div>
  )),
}));

vi.mock('./DebuggingPanel', () => {
  const MockDebuggingPanel = vi.fn((props) => {
    if (props.onTraceSectionVisibilityChange) {
      setTimeout(() => {
        props.onTraceSectionVisibilityChange(false);
      }, 0);
    }
    return (
      <div data-testid="mock-debugging-panel" data-prompt-index={props.promptIndex}>
        Mock DebuggingPanel
      </div>
    );
  });
  return { DebuggingPanel: MockDebuggingPanel };
});

import { DebuggingPanel as MockDebuggingPanel } from './DebuggingPanel';

vi.mock('./store', () => {
  const actualStore = vi.importActual('./store');
  return {
    ...actualStore,
    useTableStore: vi.fn().mockReturnValue({
      addFilter: vi.fn(),
      resetFilters: vi.fn(),
    }),
  };
});

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
  evaluationId: 'test-eval-id',
  testCaseId: 'test-case-id',
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
    expect(screen.getByText('Original Output')).toBeInTheDocument();
    expect(screen.getByText('Test output')).toBeInTheDocument();
  });

  it('displays assertion results table with metrics when provided', async () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('contains')).toBeInTheDocument();
    expect(screen.getByText('✅')).toBeInTheDocument();
  });

  it('does not display metrics column when no metrics are present', async () => {
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
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    expect(screen.queryByText('Metric')).not.toBeInTheDocument();
  });

  it('displays metadata table when provided', async () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    expect(screen.getByText('Metadata')).toBeInTheDocument();
    expect(screen.getByText('testKey')).toBeInTheDocument();
    expect(screen.getByText('testValue')).toBeInTheDocument();
  });

  it('does not display the Metadata tab when metadata is an empty object', () => {
    const propsWithEmptyMetadata = {
      ...defaultProps,
      metadata: {},
    };
    render(<EvalOutputPromptDialog {...propsWithEmptyMetadata} />);
    expect(screen.queryByText('Metadata')).toBeNull();
  });

  it('does not display the Metadata tab when metadata only contains internal keys', () => {
    const propsWithInternalMetadata = {
      ...defaultProps,
      metadata: {
        [PROMPTFOO_FILE_METADATA_KEY]: 'internal value',
      },
    };
    render(<EvalOutputPromptDialog {...propsWithInternalMetadata} />);
    expect(screen.queryByText('Metadata')).toBeNull();
  });

  it('does not display the Metadata tab when metadata is null', () => {
    render(<EvalOutputPromptDialog {...defaultProps} metadata={undefined} />);
    expect(screen.queryByText('Metadata')).toBeNull();
  });

  it('calls onClose when close button is clicked', async () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);
    await userEvent.click(screen.getByLabelText('close'));
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

    // Find all copy buttons and select the first one (for the prompt)
    const copyIcons = screen.getAllByTestId('ContentCopyIcon');
    const copyButton = copyIcons[0].closest('button');
    expect(copyButton).toBeInTheDocument();
    await userEvent.click(copyButton!);

    expect(mockClipboard.writeText).toHaveBeenCalledWith('Test prompt');
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument();
  });

  it('copies assertion value to clipboard when copy button is clicked', async () => {
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    render(<EvalOutputPromptDialog {...defaultProps} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));

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
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
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

  it('excludes citations from metadata table to avoid duplication', async () => {
    const propsWithCitations = {
      ...defaultProps,
      metadata: {
        regularKey: 'regular value',
        citations: [{ source: 'test', content: 'test content' }],
      },
    };

    render(<EvalOutputPromptDialog {...propsWithCitations} />);

    // Regular metadata should be in the table
    await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    expect(screen.getByText('regularKey')).toBeInTheDocument();
    expect(screen.getByText('regular value')).toBeInTheDocument();

    // Citations shouldn't appear in the metadata table
    const metadataTable = screen.getByText('Metadata').closest('div');
    expect(metadataTable?.textContent).not.toContain('citations');
  });

  it('renders only the "Prompt & Output" tab when no gradingResults, messages, metadata, or traces are provided', () => {
    const minimalProps = {
      open: true,
      onClose: mockOnClose,
      prompt: 'Test prompt',
      provider: 'test-provider',
      output: 'Test output',
    };

    render(<EvalOutputPromptDialog {...minimalProps} />);

    expect(screen.getByText('Prompt & Output')).toBeInTheDocument();

    expect(screen.queryByText('Evaluation')).toBeNull();
    expect(screen.queryByText('Messages')).toBeNull();
    expect(screen.queryByText('Metadata')).toBeNull();
    expect(screen.queryByText('Traces')).toBeNull();
  });

  it('gracefully handles invalid active tab index', async () => {
    const propsWithIds = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      testCaseId: 'test-case-id',
    };

    const { rerender } = render(<EvalOutputPromptDialog {...propsWithIds} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    expect(screen.getByText('Metadata')).toBeVisible();
    expect(screen.getByText('testKey')).toBeVisible();

    rerender(
      <EvalOutputPromptDialog {...propsWithIds} gradingResults={undefined} metadata={undefined} />,
    );

    expect(screen.getByText('Prompt & Output')).toBeVisible();
    expect(screen.getByText('Test prompt')).toBeInTheDocument();
  });

  it('handles unmounting during drawer transition', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const transitionDuration = { enter: 320, exit: 250 };

    ReactDOM.render(<EvalOutputPromptDialog {...defaultProps} />, container);

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });

    await act(() => new Promise((resolve) => setTimeout(resolve, transitionDuration.enter)));

    expect(true).toBe(true);

    document.body.removeChild(container);
  });

  it('passes the promptIndex prop to DebuggingPanel when provided', async () => {
    const promptIndex = 5;
    render(<EvalOutputPromptDialog {...defaultProps} promptIndex={promptIndex} />);

    const tracesTab = screen.getByText('Traces');
    await userEvent.click(tracesTab);

    expect(MockDebuggingPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIndex: promptIndex,
      }),
      expect.anything(),
    );
  });

  it('passes undefined promptIndex to DebuggingPanel when promptIndex is not provided', () => {
    render(<EvalOutputPromptDialog {...defaultProps} promptIndex={undefined} />);

    const tracesTab = screen.getByRole('tab', { name: /traces/i });
    fireEvent.click(tracesTab);

    const debuggingPanel = screen.getByTestId('mock-debugging-panel');
    expect(debuggingPanel.getAttribute('data-prompt-index')).toBeNull();
  });

  it('passes promptIndex to DebuggingPanel when testIndex is undefined', () => {
    const promptIndex = 1;
    render(
      <EvalOutputPromptDialog {...defaultProps} testIndex={undefined} promptIndex={promptIndex} />,
    );

    const tracesTab = screen.getByText('Traces');
    fireEvent.click(tracesTab);

    expect(MockDebuggingPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIndex: promptIndex,
      }),
      expect.anything(),
    );
  });

  it('hides trace section but keeps Traces tab visible when onTraceSectionVisibilityChange is called with false', async () => {
    render(<EvalOutputPromptDialog {...defaultProps} />);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.queryByTestId('mock-debugging-panel')).not.toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Traces' })).toBeInTheDocument();
  });
});

describe('EvalOutputPromptDialog metadata interaction', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();

    (useTableStore as any).mockReturnValue({
      addFilter: vi.fn(),
      resetFilters: vi.fn(),
    });
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
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });
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
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });
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
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });
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

  it('displays only valid keys when metadata contains internal and valid keys', async () => {
    const metadata = {
      testKey: 'testValue',
      [PROMPTFOO_FILE_METADATA_KEY]: 'internalValue',
      [CITATIONS_METADATA_KEY]: [{ source: 'test', content: 'test content' }],
      anotherKey: 'anotherValue',
    };

    render(<EvalOutputPromptDialog {...defaultProps} metadata={metadata} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));

    expect(screen.getByText('testKey')).toBeInTheDocument();
    expect(screen.getByText('anotherKey')).toBeInTheDocument();
    expect(screen.getByText('testValue')).toBeInTheDocument();
    expect(screen.getByText('anotherValue')).toBeInTheDocument();
    expect(screen.queryByText('_promptfooFileMetadata')).toBeNull();

    const metadataTable = screen.getByText('Metadata').closest('div');
    expect(metadataTable?.textContent).not.toContain('citations');
  });

  it('should reset filters, apply the selected metadata filter, and close the dialog when the filter button is clicked in the Metadata tab', async () => {
    const mockResetFilters = vi.fn();
    const mockAddFilter = vi.fn();
    (useTableStore as any).mockReturnValue({
      addFilter: mockAddFilter,
      resetFilters: mockResetFilters,
    });

    render(<EvalOutputPromptDialog {...defaultProps} />);
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    const filterButton = screen.getByLabelText('Filter by testKey');
    await act(async () => {
      await user.click(filterButton);
    });

    expect(mockResetFilters).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metadata',
      operator: 'equals',
      value: 'testValue',
      field: 'testKey',
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
