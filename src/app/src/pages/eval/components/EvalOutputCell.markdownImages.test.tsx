import { renderWithProviders as baseRender } from '@app/utils/testutils';
import { type EvaluateTableOutput, ResultFailureReason } from '@promptfoo/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftKeyProvider } from '../../../contexts/ShiftKeyContext';
import EvalOutputCell from './EvalOutputCell';

import type { EvalOutputCellProps } from './EvalOutputCell';

vi.mock('./EvalOutputPromptDialog', () => ({
  default: vi.fn(() => <div data-testid="dialog-component">Mocked Dialog Component</div>),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return baseRender(<ShiftKeyProvider>{ui}</ShiftKeyProvider>);
};

vi.mock('./store', () => ({
  useResultsViewSettingsStore: () => ({
    prettifyJson: false,
    renderMarkdown: false,
    showPassFail: true,
    showPassReasons: false,
    showPrompts: false,
    maxImageWidth: 256,
    maxImageHeight: 256,
  }),
  useTableStore: () => ({
    shouldHighlightSearchText: false,
  }),
}));

vi.mock('../../../hooks/useShiftKey', () => ({
  useShiftKey: () => false,
}));

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

interface MockEvalOutputCellProps extends EvalOutputCellProps {
  firstOutput: EvaluateTableOutput;
  searchText: string;
  showDiffs: boolean;
}

describe('EvalOutputCell markdown image previews', () => {
  const mockOnRating = vi.fn();

  const createProps = (overrides?: Partial<EvaluateTableOutput>): MockEvalOutputCellProps => ({
    firstOutput: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'openai:gpt-4',
      score: 1,
      text: 'Reference output',
      testCase: {},
    },
    maxTextLength: 1000,
    onRating: mockOnRating,
    output: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: false,
      failureReason: ResultFailureReason.ASSERT,
      prompt: 'Generate a blue circle',
      provider: 'openai:gpt-4',
      score: 0,
      text: 'Assertion failed\n\n![Preview](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)',
      testCase: {},
      ...overrides,
    },
    promptIndex: 0,
    rowIndex: 0,
    searchText: '',
    showDiffs: false,
    showStats: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders and previews markdown images even when renderMarkdown is disabled', async () => {
    const props = createProps();
    const { container } = renderWithProviders(<EvalOutputCell {...props} />);

    const image = screen.getByAltText('Preview');
    expect(image).toBeInTheDocument();

    await userEvent.click(image);
    expect(container.querySelector('.lightbox')).toBeInTheDocument();
  });
});
