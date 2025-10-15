import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import type { AssertionType, GradingResult } from '@promptfoo/types';
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
    return (
      <div data-testid="mock-debugging-panel" data-prompt-index={props.promptIndex}>
        Mock DebuggingPanel
      </div>
    );
  });
  return { DebuggingPanel: MockDebuggingPanel };
});

import { DebuggingPanel as MockDebuggingPanel } from './DebuggingPanel';

const mockOnClose = vi.fn();
const mockAddFilter = vi.fn();
const mockResetFilters = vi.fn();
const mockReplayEvaluation = vi.fn();
const mockFetchTraces = vi.fn().mockResolvedValue([
  {
    traceId: 'trace-1',
    testCaseId: 'test-case-id',
    spans: [{ spanId: 'span-1', name: 'test-span' }],
  },
]);

const mockCloudConfig = {
  appUrl: 'https://cloud.example.com',
  isEnabled: true,
};

const defaultProps = {
  open: true,
  onClose: mockOnClose,
  prompt: 'Test prompt',
  provider: 'test-provider',
  output: 'Test output',
  onAddFilter: mockAddFilter,
  onResetFilters: mockResetFilters,
  onReplay: mockReplayEvaluation,
  fetchTraces: mockFetchTraces,
  cloudConfig: mockCloudConfig,
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

    // Wait for traces to be fetched
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const tracesTab = screen.getByText('Traces');
    await userEvent.click(tracesTab);

    expect(MockDebuggingPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIndex: promptIndex,
      }),
      expect.anything(),
    );
  });

  it('passes undefined promptIndex to DebuggingPanel when promptIndex is not provided', async () => {
    render(<EvalOutputPromptDialog {...defaultProps} promptIndex={undefined} />);

    // Wait for traces to be fetched
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const tracesTab = screen.getByRole('tab', { name: /traces/i });
    fireEvent.click(tracesTab);

    const debuggingPanel = screen.getByTestId('mock-debugging-panel');
    expect(debuggingPanel.getAttribute('data-prompt-index')).toBeNull();
  });

  it('passes promptIndex to DebuggingPanel when testIndex is undefined', async () => {
    const promptIndex = 1;
    render(
      <EvalOutputPromptDialog {...defaultProps} testIndex={undefined} promptIndex={promptIndex} />,
    );

    // Wait for traces to be fetched
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const tracesTab = screen.getByText('Traces');
    fireEvent.click(tracesTab);

    expect(MockDebuggingPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIndex: promptIndex,
      }),
      expect.anything(),
    );
  });

  it('displays the main tab label as "Prompt" when there is no output content', () => {
    render(
      <EvalOutputPromptDialog
        {...{
          open: true,
          onClose: mockOnClose,
          prompt: 'Test prompt',
          provider: 'test-provider',
        }}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Prompt' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Prompt & Output' })).toBeNull();
  });

  it('displays the main tab label as "Prompt & Output" when output content is present', () => {
    const propsWithOutput = {
      open: true,
      onClose: mockOnClose,
      prompt: 'Test prompt',
      provider: 'test-provider',
      output: 'Test output',
    };
    render(<EvalOutputPromptDialog {...propsWithOutput} />);
    expect(screen.getByRole('tab', { name: 'Prompt & Output' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Prompt' })).toBeNull();
  });

  it('does not render OutputsPanel when no output content is present', () => {
    render(
      <EvalOutputPromptDialog
        {...{
          open: true,
          onClose: mockOnClose,
          prompt: 'Test prompt',
          provider: 'test-provider',
        }}
      />,
    );
    expect(screen.queryByText('Original Output')).toBeNull();
  });

  it('renders OutputsPanel when output content is present', () => {
    render(
      <EvalOutputPromptDialog
        {...{
          open: true,
          onClose: mockOnClose,
          prompt: 'Test prompt',
          provider: 'test-provider',
          output: 'Test output',
        }}
      />,
    );
    expect(screen.getByText('Original Output')).toBeInTheDocument();
  });

  it('should transition PromptEditor from read-only to editable when evaluationId is updated', async () => {
    const { rerender } = render(
      <EvalOutputPromptDialog {...defaultProps} evaluationId={undefined} />,
    );

    expect(screen.queryByLabelText('Edit & Replay')).toBeNull();

    await act(async () => {
      rerender(<EvalOutputPromptDialog {...defaultProps} evaluationId="test-eval-id" />);
    });

    expect(screen.getByLabelText('Edit & Replay')).toBeInTheDocument();
  });

  it('displays OutputsPanel and labels tab as "Prompt & Output" when metadata contains citations but no other output', () => {
    const propsWithCitations = {
      ...defaultProps,
      output: undefined,
      replayOutput: undefined,
      metadata: {
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

    expect(screen.getByText('Prompt & Output')).toBeInTheDocument();

    expect(screen.getByTestId('citations-component')).toBeInTheDocument();
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

  it('should reset filters, apply the selected metadata filter, and close the dialog when the filter button is clicked in the Metadata tab', async () => {
    const localMockResetFilters = vi.fn();
    const localMockAddFilter = vi.fn();
    const propsWithMocks = {
      ...defaultProps,
      onAddFilter: localMockAddFilter,
      onResetFilters: localMockResetFilters,
    };

    render(<EvalOutputPromptDialog {...propsWithMocks} />);
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    const filterButton = screen.getByLabelText('Filter by testKey');
    await act(async () => {
      await user.click(filterButton);
    });

    expect(localMockResetFilters).toHaveBeenCalledTimes(1);
    expect(localMockAddFilter).toHaveBeenCalledTimes(1);
    expect(localMockAddFilter).toHaveBeenCalledWith({
      type: 'metadata',
      operator: 'equals',
      value: 'testValue',
      field: 'testKey',
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

describe('EvalOutputPromptDialog dependency injection', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
  });

  it('should work without dependencies (graceful degradation)', async () => {
    const propsWithoutDependencies = {
      open: true,
      onClose: mockOnClose,
      prompt: 'Test prompt',
      provider: 'test-provider',
      metadata: {
        testKey: 'testValue',
      },
      // No dependencies prop
    };

    render(<EvalOutputPromptDialog {...propsWithoutDependencies} />);
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    const filterButton = screen.getByLabelText('Filter by testKey');
    await act(async () => {
      await user.click(filterButton);
    });

    // Should close dialog without errors
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call injected filter functions with correct parameters', async () => {
    const customAddFilter = vi.fn();
    const customResetFilters = vi.fn();
    const propsWithCustomFilters = {
      ...defaultProps,
      onAddFilter: customAddFilter,
      onResetFilters: customResetFilters,
      metadata: {
        customField: 'customValue',
      },
    };

    render(<EvalOutputPromptDialog {...propsWithCustomFilters} />);
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    const filterButton = screen.getByLabelText('Filter by customField');
    await act(async () => {
      await user.click(filterButton);
    });

    expect(customResetFilters).toHaveBeenCalledTimes(1);
    expect(customAddFilter).toHaveBeenCalledWith({
      type: 'metadata',
      operator: 'equals',
      value: 'customValue',
      field: 'customField',
    });
  });

  it('should handle object metadata values correctly', async () => {
    const customAddFilter = vi.fn();
    const customResetFilters = vi.fn();
    const objectValue = { nested: 'data', count: 42 };
    const propsWithObjectMetadata = {
      ...defaultProps,
      onAddFilter: customAddFilter,
      onResetFilters: customResetFilters,
      metadata: {
        objectField: objectValue,
      },
    };

    render(<EvalOutputPromptDialog {...propsWithObjectMetadata} />);
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    const filterButton = screen.getByLabelText('Filter by objectField');
    await act(async () => {
      await user.click(filterButton);
    });

    expect(customAddFilter).toHaveBeenCalledWith({
      type: 'metadata',
      operator: 'equals',
      value: JSON.stringify(objectValue),
      field: 'objectField',
    });
  });

  it('should work without filter functions', async () => {
    const propsWithoutFilterFunctions = {
      open: true,
      onClose: mockOnClose,
      prompt: 'Test prompt',
      metadata: {
        key: 'value',
      },
      // No filter props
    };

    render(<EvalOutputPromptDialog {...propsWithoutFilterFunctions} />);
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    const filterButton = screen.getByLabelText('Filter by key');

    // Should not throw error
    await act(async () => {
      await user.click(filterButton);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

describe('EvalOutputPromptDialog replay evaluation', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
  });

  it('should call replay function when Replay button is clicked', async () => {
    const customReplay = vi.fn().mockResolvedValue({ output: 'Replayed output' });
    const propsWithReplay = {
      ...defaultProps,
      onReplay: customReplay,
    };

    render(<EvalOutputPromptDialog {...propsWithReplay} />);

    // Click edit button to enter edit mode
    await act(async () => {
      await user.click(screen.getByLabelText('Edit & Replay'));
    });

    // Click replay button
    const replayButton = screen.getByRole('button', { name: /replay/i });
    await act(async () => {
      await user.click(replayButton);
    });

    expect(customReplay).toHaveBeenCalledWith({
      evaluationId: 'test-eval-id',
      testIndex: undefined,
      prompt: 'Test prompt',
      variables: undefined,
    });
  });

  it('should display replay output when successful', async () => {
    const customReplay = vi.fn().mockResolvedValue({ output: 'Replayed output text' });
    const propsWithReplay = {
      ...defaultProps,
      onReplay: customReplay,
    };

    render(<EvalOutputPromptDialog {...propsWithReplay} />);

    await act(async () => {
      await user.click(screen.getByLabelText('Edit & Replay'));
    });

    const replayButton = screen.getByRole('button', { name: /replay/i });
    await act(async () => {
      await user.click(replayButton);
    });

    await screen.findByText('Replay Output');
    expect(screen.getByText('Replayed output text')).toBeInTheDocument();
  });

  it('should display error when replay fails', async () => {
    const customReplay = vi.fn().mockResolvedValue({ error: 'Replay failed' });
    const propsWithReplay = {
      ...defaultProps,
      onReplay: customReplay,
    };

    render(<EvalOutputPromptDialog {...propsWithReplay} />);

    await act(async () => {
      await user.click(screen.getByLabelText('Edit & Replay'));
    });

    const replayButton = screen.getByRole('button', { name: /replay/i });
    await act(async () => {
      await user.click(replayButton);
    });

    await screen.findByText('Replay failed');
  });

  it('should show error if replay function is not provided', async () => {
    const propsWithoutReplay = {
      ...defaultProps,
      onReplay: undefined,
    };

    render(<EvalOutputPromptDialog {...propsWithoutReplay} />);

    await act(async () => {
      await user.click(screen.getByLabelText('Edit & Replay'));
    });

    const replayButton = screen.getByRole('button', { name: /replay/i });
    await act(async () => {
      await user.click(replayButton);
    });

    await screen.findByText('Replay functionality is not available');
  });
});

describe('EvalOutputPromptDialog cloud config', () => {
  it('should pass cloudConfig to MetadataPanel', async () => {
    const customCloudConfig = {
      appUrl: 'https://custom.cloud.com',
      isEnabled: true,
    };
    const propsWithCustomConfig = {
      ...defaultProps,
      cloudConfig: customCloudConfig,
      metadata: {
        policyName: 'Test Policy',
        policyId: 'policy-123',
      },
    };

    render(<EvalOutputPromptDialog {...propsWithCustomConfig} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    // Check that policy link is rendered (MetadataPanel uses cloudConfig)
    expect(screen.getByText('View policy in Promptfoo Cloud')).toBeInTheDocument();
  });

  it('should work without cloudConfig', async () => {
    const propsWithoutConfig = {
      ...defaultProps,
      cloudConfig: null,
      metadata: {
        policyName: 'Test Policy',
      },
    };

    render(<EvalOutputPromptDialog {...propsWithoutConfig} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    // Should just show the policy name without link
    expect(screen.getByText('Test Policy')).toBeInTheDocument();
    expect(screen.queryByText('View policy in Promptfoo Cloud')).not.toBeInTheDocument();
  });
});

describe('EvalOutputPromptDialog traces tab visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show Traces tab when fetchTraces returns trace data', async () => {
    const propsWithTraces = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      fetchTraces: vi.fn().mockResolvedValue([
        {
          traceId: 'trace-1',
          testCaseId: 'test-case-id',
          spans: [{ spanId: 'span-1', name: 'test-span' }],
        },
      ]),
    };

    render(<EvalOutputPromptDialog {...propsWithTraces} />);

    // Wait for traces to be fetched
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByRole('tab', { name: 'Traces' })).toBeInTheDocument();
  });

  it('should hide Traces tab when fetchTraces returns empty array', async () => {
    const propsWithoutTraces = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      fetchTraces: vi.fn().mockResolvedValue([]),
    };

    render(<EvalOutputPromptDialog {...propsWithoutTraces} />);

    // Wait for traces to be fetched
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });

  it('should hide Traces tab when fetchTraces is not provided', () => {
    const propsWithoutFetchTraces = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      fetchTraces: undefined,
    };

    render(<EvalOutputPromptDialog {...propsWithoutFetchTraces} />);

    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });

  it('should hide Traces tab when evaluationId is not provided', () => {
    const propsWithoutEvaluationId = {
      ...defaultProps,
      evaluationId: undefined,
    };

    render(<EvalOutputPromptDialog {...propsWithoutEvaluationId} />);

    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });

  it('should hide Traces tab when fetchTraces fails', async () => {
    const propsWithFailedFetch = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      fetchTraces: vi.fn().mockRejectedValue(new Error('Fetch failed')),
    };

    render(<EvalOutputPromptDialog {...propsWithFailedFetch} />);

    // Wait for traces fetch to fail
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });
});
