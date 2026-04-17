import * as ReactDOM from 'react-dom/client';

import { renderWithProviders } from '@app/utils/testutils';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    // Note: Do NOT use vi.useFakeTimers() here - it breaks component rendering
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders with the correct title', async () => {
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Details: test-provider')).toBeInTheDocument();
    });
  });

  it('displays prompt content', async () => {
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Prompt')).toBeInTheDocument();
    });
    expect(screen.getByText('Test prompt')).toBeInTheDocument();
  });

  it('displays output when provided', async () => {
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Original Output')).toBeInTheDocument();
    });
    expect(screen.getByText('Test output')).toBeInTheDocument();
  });

  it('displays assertion results table with metrics when provided', async () => {
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    });
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('contains')).toBeInTheDocument();
    // CircleCheck icon is an SVG with emerald color indicating pass (use document.body because Sheet uses portals)
    expect(document.body.querySelector('svg.text-emerald-600')).toBeInTheDocument();
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
    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutMetrics} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    });
    expect(screen.queryByText('Metric')).not.toBeInTheDocument();
  });

  it('displays metadata table when provided', async () => {
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });
    expect(screen.getByText('Metadata')).toBeInTheDocument();
    expect(screen.getByText('testKey')).toBeInTheDocument();
    expect(screen.getByText('testValue')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    await userEvent.click(screen.getByLabelText('close'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('copies prompt to clipboard when copy button is clicked', async () => {
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);

    // Find the prompt section - the outer container that has the hover handler
    const promptText = screen.getByText('Test prompt');
    const promptContainer = promptText.closest('.relative');
    expect(promptContainer).toBeInTheDocument();

    // Trigger hover to make copy button visible
    fireEvent.mouseEnter(promptContainer!);

    // Wait for the copy button to appear after hover
    const copyButton = await screen.findByRole('button', { name: /^copy\s*$/i });
    expect(copyButton).toBeInTheDocument();
    await userEvent.click(copyButton);

    expect(mockClipboard.writeText).toHaveBeenCalledWith('Test prompt');
    // Wait for Check icon to appear after state update (use document.body because Sheet uses portals)
    await waitFor(() => {
      expect(document.body.querySelector('svg.lucide-check')).toBeInTheDocument();
    });
  });

  it('copies assertion value to clipboard when copy button is clicked', async () => {
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    });

    // Trigger the hover event on the value cell to make the copy button visible
    const valueCell = screen.getByText('expected value').closest('td');
    if (valueCell) {
      fireEvent.mouseEnter(valueCell);
    }

    // Get the button by its aria-label
    const copyButton = screen.getByLabelText('Copy assertion value 0');
    await userEvent.click(copyButton);

    expect(mockClipboard.writeText).toHaveBeenCalledWith('expected value');
    // Wait for Check icon to appear after state update (use document.body because Sheet uses portals)
    await waitFor(() => {
      expect(document.body.querySelector('svg.lucide-check')).toBeInTheDocument();
    });
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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithLongValue} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    });
    const truncatedCell = screen.getByText(/^a+\.\.\.$/);
    await userEvent.click(truncatedCell);
    expect(screen.getByText(longValue)).toBeInTheDocument();
  });

  it('displays the Citations component when citations are in metadata', async () => {
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

    await act(async () => {
      renderWithProviders(<EvalOutputPromptDialog {...propsWithCitations} />);
    });

    // Check if Citations component is rendered with correct props
    const citationsComponent = screen.getByTestId('citations-component');
    expect(citationsComponent).toBeInTheDocument();

    // Verify citations data was passed correctly
    const passedCitations = JSON.parse(citationsComponent.getAttribute('data-citations') || '[]');
    expect(passedCitations).toEqual(propsWithCitations.metadata.citations);
  });

  it('does not display the Citations component when no citations in metadata', async () => {
    await act(async () => {
      renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    });
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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithCitations} />);

    // Regular metadata should be in the table
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });
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

    renderWithProviders(<EvalOutputPromptDialog {...minimalProps} />);

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

    const { rerender } = renderWithProviders(<EvalOutputPromptDialog {...propsWithIds} />);

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
    // This test needs fake timers to control transition timing
    vi.useFakeTimers();

    const container = document.createElement('div');
    document.body.appendChild(container);

    const transitionDuration = { enter: 320, exit: 250 };

    const root = ReactDOM.createRoot(container);
    root.render(<EvalOutputPromptDialog {...defaultProps} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    act(() => {
      root.unmount();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(transitionDuration.enter);
    });

    expect(true).toBe(true);

    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it('passes the promptIndex prop to DebuggingPanel when provided', async () => {
    const promptIndex = 5;
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} promptIndex={promptIndex} />);

    // Wait for traces tab to be available
    await waitFor(() => {
      expect(screen.getByText('Traces')).toBeInTheDocument();
    });

    const tracesTab = screen.getByText('Traces');
    await userEvent.click(tracesTab);

    expect(MockDebuggingPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIndex: promptIndex,
      }),
      undefined,
    );
  });

  it('passes undefined promptIndex to DebuggingPanel when promptIndex is not provided', async () => {
    // Use the module-level mock - vi.clearAllMocks() doesn't reset mockResolvedValue
    renderWithProviders(<EvalOutputPromptDialog {...defaultProps} promptIndex={undefined} />);

    // Wait for traces tab to be available
    await waitFor(() => {
      expect(screen.getByText('Traces')).toBeInTheDocument();
    });

    const tracesTab = screen.getByText('Traces');
    await userEvent.click(tracesTab);

    const debuggingPanel = screen.getByTestId('mock-debugging-panel');
    expect(debuggingPanel.getAttribute('data-prompt-index')).toBeNull();
  });

  it('passes promptIndex to DebuggingPanel when testIndex is undefined', async () => {
    // Use the module-level mock - vi.clearAllMocks() doesn't reset mockResolvedValue
    const promptIndex = 1;
    render(
      <EvalOutputPromptDialog {...defaultProps} testIndex={undefined} promptIndex={promptIndex} />,
    );

    // Wait for traces tab to be available
    await waitFor(() => {
      expect(screen.getByText('Traces')).toBeInTheDocument();
    });

    const tracesTab = screen.getByText('Traces');
    await userEvent.click(tracesTab);

    expect(MockDebuggingPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIndex: promptIndex,
      }),
      undefined,
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
    renderWithProviders(<EvalOutputPromptDialog {...propsWithOutput} />);
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

  it('should show Edit & Replay button when readOnly is false (default)', async () => {
    await act(async () => {
      renderWithProviders(<EvalOutputPromptDialog {...defaultProps} />);
    });

    expect(screen.getByLabelText('Edit & Replay')).toBeInTheDocument();
  });

  it('should hide Edit & Replay button when readOnly is true', async () => {
    await act(async () => {
      renderWithProviders(<EvalOutputPromptDialog {...defaultProps} readOnly={true} />);
    });

    expect(screen.queryByLabelText('Edit & Replay')).toBeNull();
  });

  it('should transition PromptEditor from read-only to editable when readOnly prop changes', async () => {
    const { rerender } = renderWithProviders(
      <EvalOutputPromptDialog {...defaultProps} readOnly={true} />,
    );

    expect(screen.queryByLabelText('Edit & Replay')).toBeNull();

    await act(async () => {
      rerender(<EvalOutputPromptDialog {...defaultProps} readOnly={false} />);
    });

    expect(screen.getByLabelText('Edit & Replay')).toBeInTheDocument();
  });

  it('displays OutputsPanel and labels tab as "Prompt & Output" when metadata contains citations but no other output', async () => {
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

    await act(async () => {
      renderWithProviders(<EvalOutputPromptDialog {...propsWithCitations} />);
    });

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithLongValue} />);
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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithLongValue} />);
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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithLongValue} />);
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    });
    const cell = screen.getByText(/^a+\.\.\.$/);

    // First click to expand
    await user.click(cell);

    expect(screen.getByText(longValue)).toBeInTheDocument();

    // Wait just over the double-click threshold (300ms) using real delay
    await new Promise((resolve) => setTimeout(resolve, 310));

    // Second click should keep it expanded (not counted as double-click)
    await user.click(cell);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithMocks} />);
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
  beforeEach(() => {
    vi.clearAllMocks();
    // Note: Do NOT use vi.useFakeTimers() here - it causes component rendering issues
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutDependencies} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));

    const filterButton = screen.getByLabelText('Filter by testKey');
    await userEvent.click(filterButton);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithCustomFilters} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));

    const filterButton = screen.getByLabelText('Filter by customField');
    await userEvent.click(filterButton);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithObjectMetadata} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));

    const filterButton = screen.getByLabelText('Filter by objectField');
    await userEvent.click(filterButton);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutFilterFunctions} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));

    const filterButton = screen.getByLabelText('Filter by key');

    // Should not throw error
    await userEvent.click(filterButton);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithReplay} />);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithReplay} />);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithReplay} />);

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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutReplay} />);

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
  it('Should not render policy link if policy is not reusable', async () => {
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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithCustomConfig} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    // Check that policy link is rendered (MetadataPanel uses cloudConfig)
    expect(screen.queryByTestId('pf-cloud-policy-detail-link')).not.toBeInTheDocument();
  });

  it('Should not render policy link if policy is not reusable', async () => {
    const customCloudConfig = {
      appUrl: 'https://custom.cloud.com',
      isEnabled: true,
    };
    const propsWithCustomConfig = {
      ...defaultProps,
      cloudConfig: customCloudConfig,
      metadata: {
        policyName: 'Test Policy',
        policyId: crypto.randomUUID(),
      },
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithCustomConfig} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    // Check that policy link is rendered (MetadataPanel uses cloudConfig)
    expect(screen.getByTestId('pf-cloud-policy-detail-link')).toBeInTheDocument();
  });

  it('should work without cloudConfig', async () => {
    const propsWithoutConfig = {
      ...defaultProps,
      cloudConfig: null,
      metadata: {
        policyName: 'Test Policy',
      },
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutConfig} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
    });

    // Should just show the policy name without link
    expect(screen.getByText('Test Policy')).toBeInTheDocument();
    expect(screen.queryByText('View policy in Promptfoo Cloud')).not.toBeInTheDocument();
  });
});

describe('EvalOutputPromptDialog redteamHistory messages rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display Messages tab when redteamHistory has entries', async () => {
    const propsWithRedteamHistory = {
      ...defaultProps,
      metadata: {
        redteamHistory: [
          { prompt: 'Attack prompt 1', output: 'Target response 1' },
          { prompt: 'Attack prompt 2', output: 'Target response 2' },
        ],
      },
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithRedteamHistory} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Messages' })).toBeInTheDocument();
    });
  });

  it('should render redteamHistory messages with promptAudio and promptImage', async () => {
    const propsWithAudioImage = {
      ...defaultProps,
      metadata: {
        redteamHistory: [
          {
            prompt: 'Attack with audio',
            promptAudio: { data: 'audiodata', format: 'mp3' },
            output: 'Target response',
          },
          {
            prompt: 'Attack with image',
            promptImage: { data: 'imagedata', format: 'png' },
            output: 'Target response 2',
          },
        ],
      },
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithAudioImage} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Messages' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }));

    // Verify the messages are rendered (ChatMessages component handles audio/image)
    expect(screen.getByText('Attack with audio')).toBeInTheDocument();
    expect(screen.getByText('Attack with image')).toBeInTheDocument();
  });

  it('should render redteamHistory messages with outputAudio and outputImage', async () => {
    const propsWithOutputMedia = {
      ...defaultProps,
      metadata: {
        redteamHistory: [
          {
            prompt: 'Attack prompt',
            output: 'Response with audio',
            outputAudio: { data: 'responseaudio', format: 'wav' },
          },
          {
            prompt: 'Attack prompt 2',
            output: 'Response with image',
            outputImage: { data: 'responseimage', format: 'jpeg' },
          },
        ],
      },
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithOutputMedia} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Messages' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }));

    expect(screen.getByText('Response with audio')).toBeInTheDocument();
    expect(screen.getByText('Response with image')).toBeInTheDocument();
  });

  it('should display Messages tab when redteamTreeHistory is present', async () => {
    const propsWithTreeHistory = {
      ...defaultProps,
      metadata: {
        redteamTreeHistory: [{ prompt: 'Tree attack prompt', output: 'Tree response' }],
      },
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithTreeHistory} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Messages' })).toBeInTheDocument();
    });
  });

  it('should filter out entries without prompt or output from redteamHistory', async () => {
    const propsWithIncompleteEntries = {
      ...defaultProps,
      metadata: {
        redteamHistory: [
          { prompt: 'Valid prompt', output: 'Valid output' },
          { prompt: 'Prompt without output' }, // Missing output
          { output: 'Output without prompt' }, // Missing prompt
        ],
      },
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithIncompleteEntries} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Messages' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }));

    // Only the valid entry should be rendered
    expect(screen.getByText('Valid prompt')).toBeInTheDocument();
    expect(screen.getByText('Valid output')).toBeInTheDocument();
    expect(screen.queryByText('Prompt without output')).not.toBeInTheDocument();
    expect(screen.queryByText('Output without prompt')).not.toBeInTheDocument();
  });
});

describe('EvalOutputPromptDialog traces tab visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use real timers here - fake timers prevent the component from rendering
  });

  afterEach(() => {
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

    renderWithProviders(<EvalOutputPromptDialog {...propsWithTraces} />);

    // Wait for traces to be fetched
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Traces' })).toBeInTheDocument();
    });
  });

  it('should hide Traces tab when fetchTraces returns empty array', async () => {
    const propsWithoutTraces = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      fetchTraces: vi.fn().mockResolvedValue([]),
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutTraces} />);

    // Wait for component to render and verify no Traces tab
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Prompt & Output' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });

  it('should hide Traces tab when fetchTraces is not provided', () => {
    const propsWithoutFetchTraces = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      fetchTraces: undefined,
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutFetchTraces} />);

    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });

  it('should hide Traces tab when evaluationId is not provided', () => {
    const propsWithoutEvaluationId = {
      ...defaultProps,
      evaluationId: undefined,
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithoutEvaluationId} />);

    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });

  it('should hide Traces tab when fetchTraces fails', async () => {
    const propsWithFailedFetch = {
      ...defaultProps,
      evaluationId: 'test-eval-id',
      fetchTraces: vi.fn().mockRejectedValue(new Error('Fetch failed')),
    };

    renderWithProviders(<EvalOutputPromptDialog {...propsWithFailedFetch} />);

    // Wait for component to render and verify no Traces tab
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Prompt & Output' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('tab', { name: 'Traces' })).not.toBeInTheDocument();
  });

  describe('object content handling (issue #768)', () => {
    it('safely renders prompt when passed as object instead of string', async () => {
      // This tests the fix for GitHub issue #768 where custom providers
      // return objects for output/prompt causing React Error #31
      const propsWithObjectPrompt = {
        ...defaultProps,
        // Simulate object being passed where string is expected (runtime type mismatch)
        prompt: { statement: 'test statement', reason: 'test reason', verdict: 'pass' } as any,
      };

      // Should not throw React Error #31
      expect(() =>
        renderWithProviders(<EvalOutputPromptDialog {...propsWithObjectPrompt} />),
      ).not.toThrow();

      await waitFor(() => {
        // Object should be serialized to JSON string
        expect(screen.getByText(/test statement/)).toBeInTheDocument();
      });
    });

    it('safely renders output when passed as object instead of string', async () => {
      const propsWithObjectOutput = {
        ...defaultProps,
        output: { statement: 'output statement', reason: 'output reason', verdict: 'fail' } as any,
      };

      expect(() =>
        renderWithProviders(<EvalOutputPromptDialog {...propsWithObjectOutput} />),
      ).not.toThrow();

      await waitFor(() => {
        expect(screen.getByText(/output statement/)).toBeInTheDocument();
      });
    });
  });
});
