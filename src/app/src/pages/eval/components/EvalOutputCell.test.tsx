import {
  type AssertionType,
  type EvaluateTableOutput,
  ResultFailureReason,
} from '@promptfoo/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftKeyProvider } from '../../../contexts/ShiftKeyContext';
import EvalOutputCell, { isImageProvider, isVideoProvider } from './EvalOutputCell';

import type { EvalOutputCellProps } from './EvalOutputCell';

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
    showPassReasons: false,
    showPrompts: true,
    maxImageWidth: 256,
    maxImageHeight: 256,
  }),
  useTableStore: () => ({
    shouldHighlightSearchText: false,
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
    await userEvent.click(screen.getByRole('button', { name: /view output and test details/i }));

    const dialogComponent = screen.getByTestId('dialog-component');
    expect(dialogComponent).toBeInTheDocument();

    // Check that metadata is passed correctly
    const passedMetadata = JSON.parse(dialogComponent.getAttribute('data-metadata') || '{}');
    expect(passedMetadata.testKey).toBe('testValue');
  });

  it('handles enter key press to open dialog', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);
    const promptButton = screen.getByRole('button', { name: /view output and test details/i });
    expect(promptButton).toBeInTheDocument();
    promptButton.focus();
    await userEvent.keyboard('{enter}');

    const dialogComponent = screen.getByTestId('dialog-component');
    expect(dialogComponent).toBeInTheDocument();

    // Check that metadata is passed correctly
    const passedMetadata = JSON.parse(dialogComponent.getAttribute('data-metadata') || '{}');
    expect(passedMetadata.testKey).toBe('testValue');
  });

  it('handles keyboard navigation between buttons', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);
    const promptButton = screen.getByRole('button', { name: /view output and test details/i });
    expect(promptButton).toBeInTheDocument();
    promptButton.focus();
    await userEvent.tab();
    expect(document.activeElement).toHaveAttribute('aria-label', 'Mark test passed');
    await userEvent.tab();
    expect(document.activeElement).toHaveAttribute('aria-label', 'Mark test failed');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /set test score/i })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /edit comment/i })).toHaveFocus();
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
    await userEvent.click(screen.getByRole('button', { name: /view output and test details/i }));

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

    await userEvent.click(screen.getByRole('button', { name: /edit comment/i }));

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

    await userEvent.click(screen.getByRole('button', { name: /edit comment/i }));

    const dialogContent = screen.getByTestId('context-text');
    expect(dialogContent).toHaveTextContent('Assertion 1 (contains): expected value');
  });

  it('handles comment updates', async () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /edit comment/i }));

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

    await userEvent.click(screen.getByRole('button', { name: /edit comment/i }));

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

  it('renders response audio from redteamHistory last turn', () => {
    const propsWithRedteamHistory: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        metadata: {
          redteamHistory: [
            {
              prompt: 'Attack prompt 1',
              output: 'Target response 1',
            },
            {
              prompt: 'Attack prompt 2',
              output: 'Target response 2',
              outputAudio: {
                data: 'base64responseaudio',
                format: 'mp3',
              },
            },
          ],
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithRedteamHistory} />);

    const responseAudioElement = screen.getByTestId('response-audio-player');
    expect(responseAudioElement).toBeInTheDocument();

    const sourceElement = responseAudioElement.querySelector('source');
    expect(sourceElement).toHaveAttribute('src', 'data:audio/mp3;base64,base64responseaudio');
  });

  it('renders response audio from redteamTreeHistory when redteamHistory is not present', () => {
    const propsWithTreeHistory: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        metadata: {
          redteamTreeHistory: [
            {
              prompt: 'Tree attack prompt',
              output: 'Tree response',
              outputAudio: {
                data: 'base64treeaudio',
                format: 'wav',
              },
            },
          ],
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithTreeHistory} />);

    const responseAudioElement = screen.getByTestId('response-audio-player');
    expect(responseAudioElement).toBeInTheDocument();

    const sourceElement = responseAudioElement.querySelector('source');
    expect(sourceElement).toHaveAttribute('src', 'data:audio/wav;base64,base64treeaudio');
  });

  it('does not render response audio when redteamHistory has no audio in last turn', () => {
    const propsWithNoAudio: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        metadata: {
          redteamHistory: [
            {
              prompt: 'Attack prompt',
              output: 'Target response without audio',
            },
          ],
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithNoAudio} />);

    expect(screen.queryByTestId('response-audio-player')).not.toBeInTheDocument();
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
    expect(sourceElement).toHaveAttribute('src', 'data:audio/mp3;base64,base64audiodata');
    expect(sourceElement).toHaveAttribute('type', 'audio/mp3');
  });

  it('renders video player when video data is present', () => {
    const propsWithVideo: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        video: {
          url: '/api/output/video/test-uuid/video.mp4',
          format: 'mp4',
          model: 'sora-2',
          size: '1280x720',
          duration: 10,
          thumbnail: '/api/output/video/test-uuid/thumbnail.webp',
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithVideo} />);

    const videoElement = screen.getByTestId('video-player');
    expect(videoElement).toBeInTheDocument();

    const sourceElement = videoElement.querySelector('source');
    expect(sourceElement).toHaveAttribute('src', '/api/output/video/test-uuid/video.mp4');
    expect(sourceElement).toHaveAttribute('type', 'video/mp4');

    expect(screen.getByText('Model: sora-2')).toBeInTheDocument();
    expect(screen.getByText('Size: 1280x720')).toBeInTheDocument();
    expect(screen.getByText('Duration: 10s')).toBeInTheDocument();
  });

  it('handles video without optional metadata', () => {
    const propsWithVideoNoMetadata: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        video: {
          url: '/api/output/video/test-uuid/video.mp4',
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithVideoNoMetadata} />);

    const videoElement = screen.getByTestId('video-player');
    expect(videoElement).toBeInTheDocument();

    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Size:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Duration:/)).not.toBeInTheDocument();
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
    global.URL = class MockURL {
      constructor() {
        return mockUrl;
      }
    } as unknown as typeof URL;

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
    global.URL = class MockURL {
      constructor() {
        return mockUrl;
      }
    } as unknown as typeof URL;

    renderWithProviders(<EvalOutputCell {...defaultProps} />);

    const shareButton = screen.getByRole('button', { name: /share output/i });
    expect(shareButton).toBeInTheDocument();

    await userEvent.click(shareButton);

    expect(mockClipboard.writeText).toHaveBeenCalled();

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    global.URL = originalURL;
  });

  it('displays the token usage tooltip with reasoning tokens', () => {
    const propsWithReasoningTokens: MockEvalOutputCellProps = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        tokenUsage: {
          prompt: 10,
          completion: 20,
          total: 35,
          completionDetails: {
            reasoning: 5,
          },
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...propsWithReasoningTokens} />);

    const expectedTooltipText =
      '10 prompt tokens + 20 completion tokens & 5 reasoning tokens = 35 total';
    const tooltipElement = screen.getByLabelText(expectedTooltipText);
    expect(tooltipElement).toBeInTheDocument();
  });

  it('does not highlight text when shouldHighlightSearchText is true but searchText is empty', () => {
    vi.mock('./store', () => ({
      useResultsViewSettingsStore: () => ({
        prettifyJson: false,
        renderMarkdown: true,
        showPassFail: true,
        showPrompts: true,
        maxImageWidth: 256,
        maxImageHeight: 256,
      }),
      useTableStore: () => ({
        shouldHighlightSearchText: true,
      }),
    }));

    const { container } = renderWithProviders(<EvalOutputCell {...defaultProps} />);
    const highlightedText = container.querySelector('.search-highlight');
    expect(highlightedText).toBeNull();

    const outputText = screen.getByText('Test output text');
    expect(outputText).toBeInTheDocument();
  });

  it('handles invalid regex in searchText gracefully', () => {
    const invalidRegex = '(';
    renderWithProviders(<EvalOutputCell {...defaultProps} searchText={invalidRegex} />);

    expect(screen.getByText('Test output text')).toBeInTheDocument();
  });

  it('handles zero-length regex matches gracefully', () => {
    const propsWithZeroLengthSearch: MockEvalOutputCellProps = {
      ...defaultProps,
      searchText: '',
    };

    renderWithProviders(<EvalOutputCell {...propsWithZeroLengthSearch} />);

    expect(screen.getByText('Test output text')).toBeInTheDocument();
  });

  it('displays latency without "(cached)" when output.response.cached is not set or is false', () => {
    const props = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        latencyMs: 123,
        response: {},
      },
    };
    renderWithProviders(<EvalOutputCell {...props} />);
    const latencyElement = screen.getByText('123 ms');
    expect(latencyElement).toBeInTheDocument();

    const props2 = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        latencyMs: 456,
        response: { cached: false },
      },
    };
    renderWithProviders(<EvalOutputCell {...props2} />);
    const latencyElement2 = screen.getByText('456 ms');
    expect(latencyElement2).toBeInTheDocument();
  });

  it('displays small cached latency values correctly', () => {
    const props = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        latencyMs: 0.1,
        response: {
          cached: true,
        },
      },
    };

    renderWithProviders(<EvalOutputCell {...props} />);

    const latencyElement = screen.getByText('0 ms (cached)');
    expect(latencyElement).toBeInTheDocument();
  });
});

describe('EvalOutputCell search highlighting boundary conditions', () => {
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

    vi.mock('./store', () => ({
      useResultsViewSettingsStore: () => ({
        prettifyJson: false,
        renderMarkdown: true,
        showPassFail: true,
        showPrompts: true,
        maxImageWidth: 256,
        maxImageHeight: 256,
      }),
      useTableStore: () => ({
        shouldHighlightSearchText: true,
      }),
    }));
  });

  it('should highlight when searchText matches the beginning of the output text', () => {
    const props = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        text: 'Test output text',
      },
      searchText: 'Test',
    };

    renderWithProviders(<EvalOutputCell {...props} />);

    const highlightedText = screen.getByText('Test');
    expect(highlightedText).toHaveClass('search-highlight');
  });

  it('should highlight when searchText matches the end of the output text', () => {
    const props = {
      ...defaultProps,
      output: {
        ...defaultProps.output,
        text: 'Test output text',
      },
      searchText: 'text',
    };

    renderWithProviders(<EvalOutputCell {...props} />);

    const highlightedText = screen.getByText('text');
    expect(highlightedText).toHaveClass('search-highlight');
  });
});

describe('EvalOutputCell with prettified JSON', () => {
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
      text: '{"key1": "value1", "key2": "value2 to search for"}',
      testCase: {},
      metadata: { testKey: 'testValue' },
    },
    promptIndex: 0,
    rowIndex: 0,
    searchText: 'value2 to search for',
    showDiffs: false,
    showStats: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mock('./store', () => ({
      useResultsViewSettingsStore: () => ({
        prettifyJson: true,
        renderMarkdown: false,
        showPassFail: true,
        showPrompts: true,
        maxImageWidth: 256,
        maxImageHeight: 256,
      }),
      useTableStore: () => ({
        shouldHighlightSearchText: true,
      }),
    }));
  });

  it('highlights search matches in prettified JSON content', () => {
    renderWithProviders(<EvalOutputCell {...defaultProps} />);
    const highlightedText = screen.getByText('value2 to search for');
    expect(highlightedText).toBeInTheDocument();
    expect(highlightedText.closest('.search-highlight')).toBeInTheDocument();
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

    // Check that the cell has highlight background but NOT text color (to avoid pill conflicts)
    expect(cellElement).toHaveStyle({
      backgroundColor: 'var(--cell-highlight-color)',
    });

    // The cell should NOT have text color applied directly to prevent pill text issues
    expect(cellElement).not.toHaveStyle({
      color: 'var(--cell-highlight-text-color)',
    });
  });

  it('does not apply highlight styling when comment does not start with !highlight', () => {
    const props = createPropsWithComment('Regular comment without highlight');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const cellElement = container.querySelector('.cell');
    expect(cellElement).toBeInTheDocument();

    // Check that the cell does not have highlight background color
    const style = cellElement!.getAttribute('style') || '';
    expect(style).not.toContain('var(--cell-highlight-color)');
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

describe('EvalOutputCell cell highlighting styling', () => {
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

  it('applies only background color to cell when highlighted, not text color', () => {
    const props = createPropsWithComment('!highlight This cell should be highlighted');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const cellElement = container.querySelector('.cell');
    expect(cellElement).toBeInTheDocument();

    // Check that the cell has highlight background but NO text color override
    expect(cellElement).toHaveStyle({
      backgroundColor: 'var(--cell-highlight-color)',
    });

    // The cell itself should NOT have the highlight text color applied directly
    expect(cellElement).not.toHaveStyle({
      color: 'var(--cell-highlight-text-color)',
    });
  });

  it('applies text color only to content areas when highlighted', () => {
    const props = createPropsWithComment('!highlight Content should be highlighted');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    // Find the content wrapper div that should have the text color
    const contentElements = container.querySelectorAll(
      'div[style*="color: var(--cell-highlight-text-color)"]',
    );
    expect(contentElements.length).toBeGreaterThan(0);

    // Verify that main content area has the highlight text color
    const hasContentWithHighlightColor = Array.from(contentElements).some(
      (element) =>
        element.textContent?.includes('Content should be highlighted') ||
        element.querySelector('*')?.textContent?.includes('Test output text'),
    );
    expect(hasContentWithHighlightColor).toBe(true);
  });

  it('preserves status pill visibility and styling when cell is highlighted', () => {
    const props = createPropsWithComment('!highlight Highlighted cell');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    // Find the status pill
    const pillElement = container.querySelector('.pill');
    expect(pillElement).toBeInTheDocument();
    expect(pillElement).toBeVisible();

    // Verify pill text is present and visible
    expect(pillElement?.textContent).toBeTruthy();

    // The pill should NOT have the cell highlight text color applied
    expect(pillElement).not.toHaveStyle({
      color: 'var(--cell-highlight-text-color)',
    });

    // Verify the cell has highlight background but pill maintains its own styling
    const cellElement = container.querySelector('.cell');
    expect(cellElement).toHaveStyle({
      backgroundColor: 'var(--cell-highlight-color)',
    });
  });

  it('preserves pass/fail pill colors when cell is highlighted', () => {
    const passProps = createPropsWithComment('!highlight Pass case');
    const { container: passContainer } = renderWithProviders(<EvalOutputCell {...passProps} />);

    const passStatus = passContainer.querySelector('.status.pass');
    expect(passStatus).toBeInTheDocument();

    const passPill = passContainer.querySelector('.pill');
    expect(passPill).toBeInTheDocument();
    expect(passPill).toBeVisible();

    // Test with fail case
    const failProps = {
      ...createPropsWithComment('!highlight Fail case'),
      output: {
        ...createPropsWithComment('!highlight Fail case').output,
        pass: false,
        gradingResult: {
          comment: '!highlight Fail case',
          componentResults: [],
          pass: false,
          reason: 'Test fail reason',
          score: 0.2,
        },
      },
    };

    const { container: failContainer } = renderWithProviders(<EvalOutputCell {...failProps} />);
    const failStatus = failContainer.querySelector('.status.fail');
    expect(failStatus).toBeInTheDocument();

    const failPill = failContainer.querySelector('.pill');
    expect(failPill).toBeInTheDocument();
    expect(failPill).toBeVisible();
  });

  it('preserves provider pill styling when cell is highlighted', () => {
    const propsWithProvider = {
      ...createPropsWithComment('!highlight Provider override test'),
      output: {
        ...createPropsWithComment('!highlight Provider override test').output,
        testCase: {
          provider: 'openai:gpt-4-mini',
        },
      },
    };

    const { container } = renderWithProviders(<EvalOutputCell {...propsWithProvider} />);

    // Find the provider pill
    const providerPill = container.querySelector('.provider.pill');
    expect(providerPill).toBeInTheDocument();
    expect(providerPill).toBeVisible();
    expect(providerPill?.textContent).toBe('openai:gpt-4-mini');

    // Provider pill should maintain its own styling even with cell highlighting
    expect(providerPill).not.toHaveStyle({
      color: 'var(--cell-highlight-text-color)',
    });
  });

  it('applies highlight text color to comment when highlighted', () => {
    const props = createPropsWithComment('!highlight This is a comment');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    // Find the comment element
    const commentElement = container.querySelector('.comment');
    expect(commentElement).toBeInTheDocument();
    expect(commentElement?.textContent).toBe('This is a comment');

    // Comment should have the highlight text color applied
    expect(commentElement).toHaveStyle({
      color: 'var(--cell-highlight-text-color)',
    });
  });

  it('does not apply text color when not highlighted', () => {
    const props = createPropsWithComment('Regular comment');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    // No elements should have the highlight text color when not highlighted
    const elementsWithHighlightColor = container.querySelectorAll(
      '[style*="var(--cell-highlight-text-color)"]',
    );
    expect(elementsWithHighlightColor.length).toBe(0);

    // Cell should not have highlight background
    const cellElement = container.querySelector('.cell');
    const style = cellElement!.getAttribute('style') || '';
    expect(style).not.toContain('var(--cell-highlight-color)');
  });

  it('maintains text visibility during highlight state transitions', async () => {
    let currentComment = 'Regular comment';
    const props = createPropsWithComment(currentComment);
    const { container, rerender } = renderWithProviders(<EvalOutputCell {...props} />);

    // Initial state - no highlighting
    let pillElement = container.querySelector('.pill');
    expect(pillElement).toBeVisible();
    expect(pillElement?.textContent).toBeTruthy();

    // Toggle highlight ON
    const highlightButton = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(highlightButton);

    // Simulate the state change by re-rendering with highlighted comment
    currentComment = '!highlight Regular comment';
    const highlightedProps = createPropsWithComment(currentComment);
    rerender(<EvalOutputCell {...highlightedProps} />);

    // Verify pill is still visible with highlighting applied
    pillElement = container.querySelector('.pill');
    expect(pillElement).toBeVisible();
    expect(pillElement?.textContent).toBeTruthy();

    // Verify cell has highlight background
    const cellElement = container.querySelector('.cell');
    expect(cellElement).toHaveStyle({
      backgroundColor: 'var(--cell-highlight-color)',
    });

    // Toggle highlight OFF
    const newHighlightButton = screen.getByLabelText('Toggle test highlight');
    await userEvent.click(newHighlightButton);

    // Simulate state change back to non-highlighted
    const unhighlightedProps = createPropsWithComment('Regular comment');
    rerender(<EvalOutputCell {...unhighlightedProps} />);

    // Verify pill is still visible without highlighting
    pillElement = container.querySelector('.pill');
    expect(pillElement).toBeVisible();
    expect(pillElement?.textContent).toBeTruthy();
  });

  it('uses CSS variables for highlighting colors', () => {
    const props = createPropsWithComment('!highlight CSS variables test');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const cellElement = container.querySelector('.cell');
    expect(cellElement).toHaveStyle({
      backgroundColor: 'var(--cell-highlight-color)',
    });

    const contentElements = container.querySelectorAll(
      '[style*="var(--cell-highlight-text-color)"]',
    );
    expect(contentElements.length).toBeGreaterThan(0);
  });

  it('maintains proper DOM structure with highlighting applied', () => {
    const props = createPropsWithComment('!highlight DOM structure test');
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    // Verify key elements are present and properly structured
    const cellElement = container.querySelector('.cell');
    expect(cellElement).toBeInTheDocument();

    const statusElement = container.querySelector('.status');
    expect(statusElement).toBeInTheDocument();

    const statusRowElement = container.querySelector('.status-row');
    expect(statusRowElement).toBeInTheDocument();

    const pillElement = container.querySelector('.pill');
    expect(pillElement).toBeInTheDocument();

    // Verify highlighting doesn't break the DOM hierarchy
    expect(statusElement?.contains(statusRowElement)).toBe(true);
    expect(statusRowElement?.contains(pillElement)).toBe(true);
    expect(cellElement?.contains(statusElement)).toBe(true);
  });
});

describe('isImageProvider helper function', () => {
  it('should return true for DALL-E 3 provider', () => {
    expect(isImageProvider('openai:image:dall-e-3')).toBe(true);
  });

  it('should return true for DALL-E 2 provider', () => {
    expect(isImageProvider('openai:image:dall-e-2')).toBe(true);
  });

  it('should return true for any provider with :image: in the name', () => {
    expect(isImageProvider('some-provider:image:model')).toBe(true);
  });

  it('should return true for Gemini image providers', () => {
    expect(isImageProvider('google:gemini-3-pro-image-preview')).toBe(true);
  });

  it('should return true for Gemini 2.5 Flash image provider', () => {
    expect(isImageProvider('google:gemini-2.5-flash-image')).toBe(true);
  });

  it('should return false for text completion providers', () => {
    expect(isImageProvider('openai:gpt-4')).toBe(false);
  });

  it('should return false for chat providers', () => {
    expect(isImageProvider('openai:chat:gpt-4')).toBe(false);
  });

  it('should return false for anthropic providers', () => {
    expect(isImageProvider('anthropic:claude-3-opus')).toBe(false);
  });

  it('should return false for undefined provider', () => {
    expect(isImageProvider(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isImageProvider('')).toBe(false);
  });
});

describe('isVideoProvider helper function', () => {
  it('should return true for Sora 2 provider', () => {
    expect(isVideoProvider('openai:video:sora-2')).toBe(true);
  });

  it('should return true for Sora 2 Pro provider', () => {
    expect(isVideoProvider('openai:video:sora-2-pro')).toBe(true);
  });

  it('should return true for any provider with :video: in the name', () => {
    expect(isVideoProvider('some-provider:video:model')).toBe(true);
  });

  it('should return false for text completion providers', () => {
    expect(isVideoProvider('openai:gpt-4')).toBe(false);
  });

  it('should return false for chat providers', () => {
    expect(isVideoProvider('openai:chat:gpt-4')).toBe(false);
  });

  it('should return false for image providers', () => {
    expect(isVideoProvider('openai:image:dall-e-3')).toBe(false);
  });

  it('should return false for anthropic providers', () => {
    expect(isVideoProvider('anthropic:claude-3-opus')).toBe(false);
  });

  it('should return false for undefined provider', () => {
    expect(isVideoProvider(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isVideoProvider('')).toBe(false);
  });
});

describe('EvalOutputCell provider error display', () => {
  const mockOnRating = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays provider-level error in fail reasons', () => {
    const propsWithError: MockEvalOutputCellProps = {
      firstOutput: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: false,
        failureReason: ResultFailureReason.ERROR,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 0,
        text: '',
        testCase: {},
      },
      maxTextLength: 100,
      onRating: mockOnRating,
      output: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: false,
        failureReason: ResultFailureReason.ERROR,
        prompt: 'Test prompt',
        provider: 'file://error_provider.py',
        score: 0,
        text: '',
        testCase: {},
        error: 'ConnectionError: Failed to connect to API server',
      },
      promptIndex: 0,
      rowIndex: 0,
      searchText: '',
      showDiffs: false,
      showStats: true,
    };

    renderWithProviders(<EvalOutputCell {...propsWithError} />);

    // The error message should be displayed in the fail reason carousel
    expect(
      screen.getByText('ConnectionError: Failed to connect to API server'),
    ).toBeInTheDocument();
  });

  it('displays provider error alongside assertion failures', () => {
    const propsWithErrorAndAssertions: MockEvalOutputCellProps = {
      firstOutput: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: false,
        failureReason: ResultFailureReason.ERROR,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 0,
        text: '',
        testCase: {},
      },
      maxTextLength: 100,
      onRating: mockOnRating,
      output: {
        cost: 0,
        gradingResult: {
          componentResults: [
            {
              assertion: {
                type: 'contains' as AssertionType,
                value: 'expected',
              },
              pass: false,
              reason: 'Output does not contain expected value',
              score: 0,
            },
          ],
          pass: false,
          reason: 'Assertion failed',
          score: 0,
        },
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: false,
        failureReason: ResultFailureReason.ERROR,
        prompt: 'Test prompt',
        provider: 'file://error_provider.py',
        score: 0,
        text: '',
        testCase: {},
        error: 'AuthenticationError: Invalid API key',
      },
      promptIndex: 0,
      rowIndex: 0,
      searchText: '',
      showDiffs: false,
      showStats: true,
    };

    renderWithProviders(<EvalOutputCell {...propsWithErrorAndAssertions} />);

    // The provider error should be displayed (it's unshifted to the front)
    expect(screen.getByText('AuthenticationError: Invalid API key')).toBeInTheDocument();
  });

  it('does not display error when output.error is null', () => {
    const propsWithNullError: MockEvalOutputCellProps = {
      firstOutput: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 1,
        text: 'Success output',
        testCase: {},
      },
      maxTextLength: 100,
      onRating: mockOnRating,
      output: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 1,
        text: 'Success output',
        testCase: {},
        error: null,
      },
      promptIndex: 0,
      rowIndex: 0,
      searchText: '',
      showDiffs: false,
      showStats: true,
    };

    const { container } = renderWithProviders(<EvalOutputCell {...propsWithNullError} />);

    // No fail-reason element should be present
    expect(container.querySelector('.fail-reason')).not.toBeInTheDocument();
  });
});

describe('EvalOutputCell thumbs up/down toggle functionality', () => {
  const mockOnRating = vi.fn();

  const createPropsForToggleTest = (): MockEvalOutputCellProps => ({
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

  it('should toggle thumbs up rating to null when clicked again', async () => {
    const props = createPropsForToggleTest();
    renderWithProviders(<EvalOutputCell {...props} />);

    const thumbsUpButton = screen.getByLabelText('Mark test passed');
    expect(thumbsUpButton).toBeInTheDocument();

    // First click - set rating to true
    await userEvent.click(thumbsUpButton);
    expect(mockOnRating).toHaveBeenCalledWith(true, undefined, 'Initial comment');

    // Clear the mock to track the next call
    mockOnRating.mockClear();

    // On second click, it should toggle to null
    await userEvent.click(thumbsUpButton);

    // The second click should pass null (toggle off behavior)
    expect(mockOnRating).toHaveBeenCalledWith(null, undefined, 'Initial comment');
  });

  it('should toggle thumbs down rating to null when clicked again', async () => {
    const props = createPropsForToggleTest();
    renderWithProviders(<EvalOutputCell {...props} />);

    const thumbsDownButton = screen.getByLabelText('Mark test failed');
    expect(thumbsDownButton).toBeInTheDocument();

    // First click - set rating to false
    await userEvent.click(thumbsDownButton);
    expect(mockOnRating).toHaveBeenCalledWith(false, undefined, 'Initial comment');

    mockOnRating.mockClear();

    // On second click, it should toggle to null
    await userEvent.click(thumbsDownButton);
    expect(mockOnRating).toHaveBeenCalledWith(null, undefined, 'Initial comment');
  });

  it('should allow switching from thumbs up to thumbs down', async () => {
    const props = createPropsForToggleTest();
    renderWithProviders(<EvalOutputCell {...props} />);

    const thumbsUpButton = screen.getByLabelText('Mark test passed');
    const thumbsDownButton = screen.getByLabelText('Mark test failed');

    // Click thumbs up first
    await userEvent.click(thumbsUpButton);
    expect(mockOnRating).toHaveBeenNthCalledWith(1, true, undefined, 'Initial comment');

    // Then click thumbs down
    await userEvent.click(thumbsDownButton);
    expect(mockOnRating).toHaveBeenNthCalledWith(2, false, undefined, 'Initial comment');
  });

  it('should preserve comment when toggling rating', async () => {
    const props = {
      ...createPropsForToggleTest(),
      output: {
        ...createPropsForToggleTest().output,
        gradingResult: {
          comment: 'Important comment',
          componentResults: [],
          pass: true,
          reason: 'Test reason',
          score: 0.8,
        },
      },
    };
    renderWithProviders(<EvalOutputCell {...props} />);

    const thumbsUpButton = screen.getByLabelText('Mark test passed');
    await userEvent.click(thumbsUpButton);

    // Verify comment is passed to onRating
    expect(mockOnRating).toHaveBeenCalledWith(true, undefined, 'Important comment');
  });
});

describe('EvalOutputCell pass reasons setting', () => {
  const mockOnRating = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Default mock has showPassReasons: false
  it('should not show pass reasons when showPassReasons setting is false', () => {
    const propsWithPassReasons: MockEvalOutputCellProps = {
      firstOutput: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 0.9,
        text: 'Test output text',
        testCase: {},
      },
      maxTextLength: 100,
      onRating: mockOnRating,
      output: {
        cost: 0,
        gradingResult: {
          componentResults: [
            {
              assertion: {
                metric: 'accuracy',
                type: 'llm-rubric' as AssertionType,
                value: 'Check if response is helpful',
              },
              pass: true,
              reason: 'The response was helpful and addressed all points',
              score: 0.9,
            },
          ],
          pass: true,
          reason: 'Test passed',
          score: 0.9,
        },
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 0.9,
        text: 'Test output text',
        testCase: {},
      },
      promptIndex: 0,
      rowIndex: 0,
      searchText: '',
      showDiffs: false,
      showStats: true,
    };

    const { container } = renderWithProviders(<EvalOutputCell {...propsWithPassReasons} />);

    // Pass reasons should not be visible when setting is false (default)
    expect(container.querySelector('.pass-reasons')).not.toBeInTheDocument();
  });
});

/**
 * Tests for lightbox functionality with inline images.
 * These tests verify the fix for issue #969 (markdown re-rendering)
 * by testing that the lightbox toggle works correctly with useCallback.
 * @see https://github.com/promptfoo/promptfoo/issues/969
 */
describe('EvalOutputCell inline image lightbox', () => {
  const mockOnRating = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens lightbox when clicking on inline image and closes when clicking lightbox', async () => {
    // Use a data URI which triggers the inline image rendering path (not markdown)
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const props: MockEvalOutputCellProps = {
      firstOutput: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 1.0,
        text: 'First output',
        testCase: {},
      },
      maxTextLength: 1000,
      onRating: mockOnRating,
      output: {
        cost: 0,
        gradingResult: {
          componentResults: [],
          pass: true,
          reason: 'Test passed',
          score: 1.0,
        },
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 1.0,
        text: dataUri,
        testCase: {},
      },
      promptIndex: 0,
      rowIndex: 0,
      searchText: '',
      showDiffs: false,
      showStats: false,
    };

    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const imgElement = screen.getByRole('img');
    expect(imgElement).toBeInTheDocument();

    // Open lightbox
    await userEvent.click(imgElement);
    expect(container.querySelector('.lightbox')).toBeInTheDocument();

    // Close lightbox
    await userEvent.click(container.querySelector('.lightbox')!);
    expect(container.querySelector('.lightbox')).not.toBeInTheDocument();
  });

  it('toggleLightbox maintains stable behavior across multiple toggles', async () => {
    // Use a data URI which triggers the inline image rendering path
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const props: MockEvalOutputCellProps = {
      firstOutput: {
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 1.0,
        text: 'First output',
        testCase: {},
      },
      maxTextLength: 1000,
      onRating: mockOnRating,
      output: {
        cost: 0,
        gradingResult: {
          componentResults: [],
          pass: true,
          reason: 'Test passed',
          score: 1.0,
        },
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        pass: true,
        failureReason: ResultFailureReason.NONE,
        prompt: 'Test prompt',
        provider: 'test-provider',
        score: 1.0,
        text: dataUri,
        testCase: {},
      },
      promptIndex: 0,
      rowIndex: 0,
      searchText: '',
      showDiffs: false,
      showStats: false,
    };

    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const imgElement = screen.getByRole('img');

    // Toggle open
    await userEvent.click(imgElement);
    expect(container.querySelector('.lightbox')).toBeInTheDocument();

    // Toggle closed
    await userEvent.click(container.querySelector('.lightbox')!);
    expect(container.querySelector('.lightbox')).not.toBeInTheDocument();

    // Toggle open again (tests useCallback stability with functional update)
    await userEvent.click(imgElement);
    expect(container.querySelector('.lightbox')).toBeInTheDocument();

    // Toggle closed again
    await userEvent.click(container.querySelector('.lightbox')!);
    expect(container.querySelector('.lightbox')).not.toBeInTheDocument();

    // Toggle once more to ensure the pattern continues to work
    await userEvent.click(imgElement);
    expect(container.querySelector('.lightbox')).toBeInTheDocument();
  });
});
