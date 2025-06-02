import { render, screen } from '@testing-library/react';
import {
  ResultFailureReason,
  type AssertionType,
  type EvaluateTableOutput,
} from '@promptfoo/types';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ShiftKeyProvider } from '../../../contexts/ShiftKeyContext';
import type { EvalOutputCellProps } from './EvalOutputCell';
import EvalOutputCell from './EvalOutputCell';

// Mock the EvalOutputPromptDialog component to check what props are passed to it
vi.mock('./EvalOutputPromptDialog', () => ({
  default: vi.fn(({ metadata }) => (
    <div data-testid="dialog-component" data-metadata={JSON.stringify(metadata)}>
      Mocked Dialog Component
    </div>
  )),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<ShiftKeyProvider>{ui}</ShiftKeyProvider>);
};

vi.mock('./store', () => ({
  useResultsViewSettingsStore: () => ({
    prettifyJson: false,
    renderMarkdown: true,
    showPassFail: true,
    showPrompts: true,
    maxImageWidth: 256,
    maxImageHeight: 256,
  }),
}));

vi.mock('../../../hooks/useShiftKey', () => ({
  useShiftKey: () => true,
}));

interface MockEvalOutputCellProps extends EvalOutputCellProps {
  firstOutput: EvaluateTableOutput;
  searchText: string;
  showDiffs: boolean;
}

describe('EvalOutputCell', () => {
  const mockOnRating = vi.fn();

  const defaultProps: MockEvalOutputCellProps = {
    firstOutput: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
      testCase: {},
    },
    maxTextLength: 100,
    onRating: mockOnRating,
    output: {
      cost: 0,
      gradingResult: {
        comment: 'Initial comment',
        componentResults: [
          {
            assertion: {
              metric: 'accuracy',
              type: 'contains' as AssertionType,
              value: 'expected value',
            },
            pass: true,
            reason: 'Perfect match',
            score: 1.0,
          },
          {
            assertion: {
              metric: 'relevance',
              type: 'similar',
              value: 'another value',
            },
            pass: false,
            reason: 'Partial match',
            score: 0.6,
          },
        ],
        pass: true,
        reason: 'Test reason',
        score: 0.8,
      },
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
      testCase: {},
      metadata: { testKey: 'testValue' },
    },
    promptIndex: 0,
    rowIndex: 0,
    searchText: '',
    showDiffs: false,
    showStats: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes metadata correctly to the dialog', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);
    await userEvent.click(screen.getByText('🔎'));

    const dialogComponent = screen.getByTestId('dialog-component');
    expect(dialogComponent).toBeInTheDocument();

    // Check that metadata is passed correctly
    const passedMetadata = JSON.parse(dialogComponent.getAttribute('data-metadata') || '{}');
    expect(passedMetadata.testKey).toBe('testValue');
  });

  it('preserves existing metadata citations', async () => {
    const propsWithMetadataCitations = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        metadata: {
          testKey: 'testValue',
          citations: [{ source: 'metadata source', content: 'metadata content' }],
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithMetadataCitations} />);
    await userEvent.click(screen.getByText('🔎'));

    const dialogComponent = screen.getByTestId('dialog-component');
    const passedMetadata = JSON.parse(dialogComponent.getAttribute('data-metadata') || '{}');

    // Metadata citations should be preserved
    expect(passedMetadata.citations).toEqual([
      { source: 'metadata source', content: 'metadata content' },
    ]);
  });

  it('displays pass/fail status correctly', () => {
    const { container } = renderWithProviders(<EvalOutputCell {...defaultProps} />);

    const pillElement = screen.getByText('1 FAIL 1 PASS');
    expect(pillElement).toBeInTheDocument();

    const scoreElement = screen.getByText('(0.80)');
    expect(scoreElement).toBeInTheDocument();

    const statusElement = container.querySelector('.status.pass');
    expect(statusElement).toBeInTheDocument();
  });

  it('combines assertion contexts in comment dialog', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    await userEvent.click(screen.getByText('✏️'));

    const dialogContent = screen.getByTestId('context-text');
    expect(dialogContent).toHaveTextContent('Assertion 1 (accuracy): expected value');
    expect(dialogContent).toHaveTextContent('Assertion 2 (relevance): another value');
  });

  it('uses assertion type when metric is not available', async () => {
    const propsWithoutMetrics: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        gradingResult: {
          ...defaultProps.output.gradingResult,
          componentResults: [
            {
              assertion: {
                type: 'contains' as AssertionType,
                value: 'expected value',
              },
              pass: true,
              reason: 'Perfect match',
              score: 1.0,
            },
          ],
          pass: true,
          reason: 'Test reason',
          score: 1.0,
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithoutMetrics} />);

    await userEvent.click(screen.getByText('✏️'));

    const dialogContent = screen.getByTestId('context-text');
    expect(dialogContent).toHaveTextContent('Assertion 1 (contains): expected value');
  });

  it('handles comment updates', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    await userEvent.click(screen.getByText('✏️'));

    const commentInput = screen.getByRole('textbox');
    await userEvent.clear(commentInput);
    await userEvent.type(commentInput, 'New comment');

    await userEvent.click(screen.getByText('Save'));

    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, 'New comment');
  });

  it('handles highlight toggle', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    await userEvent.click(screen.getByLabelText('Edit comment'));

    await userEvent.click(screen.getByLabelText('Toggle test highlight'));
    expect(mockOnRating).toHaveBeenNthCalledWith(
      1,
      undefined,
      undefined,
      '!highlight Initial comment',
    );

    await userEvent.click(screen.getByLabelText('Toggle test highlight'));

    expect(mockOnRating).toHaveBeenNthCalledWith(2, undefined, undefined, 'Initial comment');
  });

  it('falls back to output text when no component results', async () => {
    const propsWithoutResults: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        gradingResult: {
          ...defaultProps.output.gradingResult,
          componentResults: undefined,
          pass: false,
          reason: '',
          score: 0,
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithoutResults} />);

    await userEvent.click(screen.getByText('✏️'));

    const dialogContent = screen.getByTestId('context-text');
    expect(dialogContent).toHaveTextContent('Test output text');
  });

  it('renders audio player when audio data is present', () => {
    const propsWithAudio: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        audio: {
          data: 'base64audiodata',
          format: 'wav',
          transcript: 'Test audio transcript',
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithAudio} />);

    const audioElement = screen.getByTestId('audio-player');
    expect(audioElement).toBeInTheDocument();

    const sourceElement = screen.getByTestId('audio-player').querySelector('source');
    expect(sourceElement).toHaveAttribute('src', 'data:audio/wav;base64,base64audiodata');
    expect(sourceElement).toHaveAttribute('type', 'audio/wav');

    expect(screen.getByText('Test audio transcript')).toBeInTheDocument();
  });

  it('handles audio without transcript', () => {
    const propsWithAudioNoTranscript: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        audio: {
          data: 'base64audiodata',
          format: 'wav',
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithAudioNoTranscript} />);

    const audioElement = screen.getByTestId('audio-player');
    expect(audioElement).toBeInTheDocument();

    expect(screen.queryByText(/transcript/i)).not.toBeInTheDocument();
  });

  it('uses default wav format when format is not specified', () => {
    const propsWithAudioNoFormat: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        audio: {
          data: 'base64audiodata',
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithAudioNoFormat} />);

    const sourceElement = screen.getByTestId('audio-player').querySelector('source');
    expect(sourceElement).toHaveAttribute('src', 'data:audio/wav;base64,base64audiodata');
    expect(sourceElement).toHaveAttribute('type', 'audio/wav');
  });

  it('allows copying row link to clipboard', async () => {
    const originalClipboard = navigator.clipboard;
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
      writable: true,
    });

    const originalURL = global.URL;
    const mockUrl = {
      toString: vi.fn().mockReturnValue('https://example.com/?rowId=1'),
      searchParams: {
        set: vi.fn(),
      },
    };
    global.URL = vi.fn(() => mockUrl) as any;

    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    const shareButton = screen.getByLabelText('Share output');
    expect(shareButton).toBeInTheDocument();

    await userEvent.click(shareButton);

    expect(mockUrl.searchParams.set).toHaveBeenCalledWith('rowId', '1');

    expect(mockClipboard.writeText).toHaveBeenCalled();

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    global.URL = originalURL;
  });

  it('shows checkmark after copying link', async () => {
    const originalClipboard = navigator.clipboard;
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
      writable: true,
    });

    const mockUrl = {
      toString: vi.fn().mockReturnValue('https://example.com/?rowId=1'),
      searchParams: {
        set: vi.fn(),
      },
    };
    const originalURL = global.URL;
    global.URL = vi.fn(() => mockUrl) as any;

    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    const shareButtonWrapper = screen.getByText('🔗').closest('.action');
    expect(shareButtonWrapper).toBeInTheDocument();

    await userEvent.click(shareButtonWrapper!);

    expect(mockClipboard.writeText).toHaveBeenCalled();

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    global.URL = originalURL;
  });
});

describe('EvalOutputCell highlight toggle functionality', () => {
  const mockOnRating = vi.fn();

  const createPropsWithComment = (comment: string): MockEvalOutputCellProps => ({
    firstOutput: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
      testCase: {},
    },
    maxTextLength: 100,
    onRating: mockOnRating,
    output: {
      cost: 0,
      gradingResult: {
        comment,
        componentResults: [],
        pass: true,
        reason: 'Test reason',
        score: 0.8,
      },
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
      testCase: {},
    },
    promptIndex: 0,
    rowIndex: 0,
    searchText: '',
    showDiffs: false,
    showStats: true,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles highlight on when comment does not start with !highlight', async () => {
    const props = createPropsWithComment('Regular comment');
    renderWithProviders(<EvalOutputCell {...props} />);

    // Click the highlight toggle button (only visible when shift is pressed)
    const highlightButton = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(highlightButton);

    // Verify that onRating was called with the highlighted comment
    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, '!highlight Regular comment');
  });

  it('toggles highlight off when comment starts with !highlight', async () => {
    const props = createPropsWithComment('!highlight Already highlighted comment');
    renderWithProviders(<EvalOutputCell {...props} />);

    const highlightButton = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(highlightButton);

    // Verify that onRating was called with the unhighlighted comment
    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, 'Already highlighted comment');
  });

  it('handles empty comment when toggling highlight on', async () => {
    const props = createPropsWithComment('');
    renderWithProviders(<EvalOutputCell {...props} />);

    const highlightButton = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(highlightButton);

    // Verify that onRating was called with just the highlight prefix
    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, '!highlight');
  });

  it('handles comment with only !highlight when toggling off', async () => {
    const props = createPropsWithComment('!highlight');
    renderWithProviders(<EvalOutputCell {...props} />);

    const highlightButton = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(highlightButton);

    // Verify that onRating was called with empty string
    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, '');
  });

  it('applies highlight styling when comment starts with !highlight', () => {
    const props = createPropsWithComment('!highlight This cell should be highlighted');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const cellElement = container.querySelector('.cell');
    expect(cellElement).toBeInTheDocument();

    // Check that the cell has highlight styling applied
    expect(cellElement).toHaveStyle({
      backgroundColor: 'var(--cell-highlight-color)',
      color: 'var(--cell-highlight-text-color)',
    });
  });

  it('does not apply highlight styling when comment does not start with !highlight', () => {
    const props = createPropsWithComment('Regular comment without highlight');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const cellElement = container.querySelector('.cell');
    expect(cellElement).toBeInTheDocument();

    // Check that the cell does not have highlight background color
    expect(cellElement).not.toHaveStyle({
      backgroundColor: 'var(--cell-highlight-color)',
    });
  });

  it('displays comment text without !highlight prefix in comment display', () => {
    const props = createPropsWithComment('!highlight This is the actual comment text');
    renderWithProviders(<EvalOutputCell {...props} />);

    // The comment should be displayed without the !highlight prefix
    const commentElement = screen.getByText('This is the actual comment text');
    expect(commentElement).toBeInTheDocument();
  });

  it('shows highlight button only when shift key is pressed', () => {
    const props = createPropsWithComment('Regular comment');
    renderWithProviders(<EvalOutputCell {...props} />);

    // The highlight button should be visible because useShiftKey is mocked to return true
    const highlightButton = screen.getByLabelText('Toggle test highlight');
    expect(highlightButton).toBeInTheDocument();
  });

  it('maintains comment state correctly through multiple toggles', async () => {
    // Test toggling ON from regular comment
    const regularProps = createPropsWithComment('Original comment');
    const { rerender } = renderWithProviders(<EvalOutputCell {...regularProps} />);

    const highlightButton = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(highlightButton);
    expect(mockOnRating).toHaveBeenNthCalledWith(
      1,
      undefined,
      undefined,
      '!highlight Original comment',
    );

    // Test toggling OFF from highlighted comment
    mockOnRating.mockClear();
    const highlightedProps = createPropsWithComment('!highlight Original comment');
    rerender(<EvalOutputCell {...highlightedProps} />);

    const highlightButtonAfterRerender = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(highlightButtonAfterRerender);
    expect(mockOnRating).toHaveBeenCalledWith(undefined, undefined, 'Original comment');
  });
});

describe('EvalOutputCell provider override', () => {
  const defaultProps: MockEvalOutputCellProps = {
    firstOutput: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
      testCase: {},
    },
    maxTextLength: 100,
    onRating: vi.fn(),
    output: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'test-provider',
      score: 0.8,
      text: 'Test output text',
      testCase: {},
    },
    promptIndex: 0,
    rowIndex: 0,
    searchText: '',
    showDiffs: false,
    showStats: true,
  };

  it('shows provider override when test case has a provider string', () => {
    const props = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        provider: 'openai:gpt-4',
        testCase: {
          provider: 'openai:gpt-4-mini',
        },
      },
    };

    const { container } = renderWithProviders(<EvalOutputCell {...props} />);
    expect(container.querySelector('.provider.pill')).toHaveTextContent('openai:gpt-4-mini');
  });

  it('shows provider override when test case has a provider object', () => {
    const props = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        provider: 'openai:gpt-4',
        testCase: {
          provider: {
            id: 'openai:gpt-4-mini',
            config: {
              model: 'gpt-4-mini',
            },
          },
        },
      },
    };

    const { container } = renderWithProviders(<EvalOutputCell {...props} />);
    expect(container.querySelector('.provider.pill')).toHaveTextContent('openai:gpt-4-mini');
  });

  it('does not show provider override when test case has no provider', () => {
    const props = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        provider: 'openai:gpt-4',
        testCase: {},
      },
    };

    const { container } = renderWithProviders(<EvalOutputCell {...props} />);
    expect(container.querySelector('.provider.pill')).not.toBeInTheDocument();
  });
});
